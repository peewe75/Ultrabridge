import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import AuditLog, Client, Invoice, License, Payment, Subscription
from app.services.invoicing import issue_invoice, mark_invoice_paid
from app.services.tax import evaluate_tax


def process_stripe_event(db: Session, event: dict) -> None:
    event_type = event.get("type")
    data_object = (event.get("data") or {}).get("object", {})

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data_object)
    elif event_type == "invoice.paid":
        _handle_invoice_paid(db, data_object)
    elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        _handle_subscription_change(db, data_object, event_type)


def _handle_checkout_completed(db: Session, session_obj: dict) -> None:
    metadata = session_obj.get("metadata") or {}
    if (metadata.get("billing_kind") or "").upper() == "INVOICE_PAYMENT" and metadata.get("invoice_number"):
        _handle_invoice_payment_checkout_completed(db, session_obj, metadata)
        return

    email = session_obj.get("customer_details", {}).get("email") or session_obj.get("customer_email")
    plan_code = metadata.get("plan_code")
    if not email or not plan_code:
        return

    client = db.query(Client).filter(Client.email == email).one_or_none()
    if not client:
        client = Client(
            id=str(uuid.uuid4()),
            full_name=metadata.get("full_name") or session_obj.get("customer_details", {}).get("name") or email.split("@")[0],
            email=email,
            country_code=(metadata.get("country_code") or None),
            fiscal_profile={
                "is_business": str(metadata.get("is_business", "")).lower() in {"1", "true", "yes"},
                "vat_id": metadata.get("customer_vat_id") or None,
                "vat_exempt": str(metadata.get("vat_exempt", "")).lower() in {"1", "true", "yes"},
                "company_name": metadata.get("company_name") or None,
            },
            status="ACTIVE",
        )
        db.add(client)
        db.flush()
    else:
        if metadata.get("country_code"):
            client.country_code = metadata.get("country_code") or client.country_code
        fiscal = dict(client.fiscal_profile or {})
        for key, meta_key in {
            "is_business": "is_business",
            "vat_id": "customer_vat_id",
            "vat_exempt": "vat_exempt",
            "company_name": "company_name",
        }.items():
            if meta_key in metadata and metadata.get(meta_key) not in (None, ""):
                val = metadata.get(meta_key)
                if key in {"is_business", "vat_exempt"}:
                    fiscal[key] = str(val).lower() in {"1", "true", "yes"}
                else:
                    fiscal[key] = val
        client.fiscal_profile = fiscal

    stripe_sub_id = session_obj.get("subscription")
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == stripe_sub_id).one_or_none() if stripe_sub_id else None
    if not sub:
        sub = Subscription(
            id=str(uuid.uuid4()),
            client_id=client.id,
            plan_code=plan_code,
            stripe_customer_id=session_obj.get("customer"),
            stripe_subscription_id=stripe_sub_id,
            status="ACTIVE",
        )
        db.add(sub)
    else:
        sub.client_id = client.id
        sub.plan_code = plan_code
        sub.stripe_customer_id = session_obj.get("customer") or sub.stripe_customer_id
        sub.status = "ACTIVE"

    existing_license = db.query(License).filter(License.client_id == client.id, License.plan_code == plan_code).order_by(License.created_at.desc()).first()
    if existing_license:
        existing_license.status = "ACTIVE"
        if not existing_license.expiry_at:
            from datetime import timedelta
            existing_license.expiry_at = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=30)
    else:
        lic = License(
            id=f"SB-{uuid.uuid4().hex[:8].upper()}",
            client_id=client.id,
            plan_code=plan_code,
            status="ACTIVE",
            mt_accounts={"MT4": [], "MT5": []},
        )
        db.add(lic)

    amount_total = session_obj.get("amount_total") or 0
    payment = db.query(Payment).filter(Payment.stripe_checkout_session_id == session_obj.get("id")).one_or_none()
    if not payment:
        payment = Payment(
            id=str(uuid.uuid4()),
            client_id=client.id,
            subscription_id=sub.id,
            stripe_checkout_session_id=session_obj.get("id"),
            amount_cents=amount_total,
            currency=(session_obj.get("currency") or "eur").upper(),
            status="PAID" if session_obj.get("payment_status") == "paid" else "PENDING",
            paid_at=datetime.now(timezone.utc) if session_obj.get("payment_status") == "paid" else None,
            metadata_json=metadata,
        )
        db.add(payment)
        db.flush()
    else:
        payment.status = "PAID" if session_obj.get("payment_status") == "paid" else payment.status
        payment.paid_at = payment.paid_at or (datetime.now(timezone.utc) if session_obj.get("payment_status") == "paid" else None)

    if (payment.status or "").upper() == "PAID":
        existing_invoice = db.query(Invoice).filter(Invoice.payment_id == payment.id).one_or_none()
        if not existing_invoice:
            issue_invoice(
                db,
                client=client,
                amount_cents=payment.amount_cents,
                currency=payment.currency,
                description=f"SoftiBridge {plan_code} - Attivazione / primo periodo",
                payment_id=payment.id,
                initial_status="PAID",
            )
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="STRIPE",
        action="CHECKOUT_COMPLETED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details={"email": email, "plan_code": plan_code, "session_id": session_obj.get("id")},
    ))


def _handle_invoice_payment_checkout_completed(db: Session, session_obj: dict, metadata: dict) -> None:
    invoice_number = metadata.get("invoice_number")
    client_id = metadata.get("client_id")
    if not invoice_number:
        return
    invoice = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).one_or_none()
    if not invoice:
        return
    client = None
    if client_id:
        client = db.query(Client).filter(Client.id == client_id).one_or_none()
    if not client and invoice.client_id:
        client = db.query(Client).filter(Client.id == invoice.client_id).one_or_none()

    payment = None
    if invoice.payment_id:
        payment = db.query(Payment).filter(Payment.id == invoice.payment_id).one_or_none()
    if not payment:
        payment = Payment(
            id=str(uuid.uuid4()),
            client_id=client.id if client else invoice.client_id,
            subscription_id=None,
            stripe_checkout_session_id=session_obj.get("id"),
            amount_cents=invoice.total_cents,
            currency=invoice.currency,
            status="PAID" if session_obj.get("payment_status") == "paid" else "PENDING",
            paid_at=datetime.now(timezone.utc) if session_obj.get("payment_status") == "paid" else None,
            metadata_json={"invoice_number": invoice_number, "billing_kind": "INVOICE_PAYMENT"},
        )
        db.add(payment)
        db.flush()
        invoice.payment_id = payment.id
    else:
        payment.stripe_checkout_session_id = payment.stripe_checkout_session_id or session_obj.get("id")
        if session_obj.get("payment_status") == "paid":
            payment.status = "PAID"
            payment.paid_at = payment.paid_at or datetime.now(timezone.utc)

    if session_obj.get("payment_status") == "paid":
        mark_invoice_paid(db, invoice=invoice, actor_type="STRIPE")
    else:
        invoice.status = "PENDING_PAYMENT"

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="STRIPE",
        action="INVOICE_CHECKOUT_COMPLETED",
        entity_type="INVOICE",
        entity_id=invoice.id,
        details={"invoice_number": invoice_number, "session_id": session_obj.get("id"), "payment_status": session_obj.get("payment_status")},
    ))


def _handle_invoice_paid(db: Session, invoice_obj: dict) -> None:
    stripe_sub_id = invoice_obj.get("subscription")
    amount_paid = invoice_obj.get("amount_paid") or 0
    currency = (invoice_obj.get("currency") or "eur").upper()
    customer_email = invoice_obj.get("customer_email") or ""

    sub = None
    if stripe_sub_id:
        sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == stripe_sub_id).one_or_none()
    client = db.query(Client).filter(Client.email == customer_email).one_or_none() if customer_email else None

    if sub:
        sub.status = "ACTIVE"
    if client:
        lic = db.query(License).filter(License.client_id == client.id).order_by(License.created_at.desc()).first()
        if lic:
            lic.status = "ACTIVE"
            current_expiry = lic.expiry_at or datetime.now(timezone.utc)
            base = current_expiry if current_expiry > datetime.now(timezone.utc) else datetime.now(timezone.utc)
            from datetime import timedelta
            lic.expiry_at = base + timedelta(days=30)

    existing_invoice = db.query(Invoice).filter(Invoice.stripe_invoice_id == invoice_obj.get("id")).one_or_none() if invoice_obj.get("id") else None
    if not existing_invoice and client:
        billing_reason = (invoice_obj.get("billing_reason") or "").lower()
        if billing_reason in {"subscription_create", "subscription_cycle", "manual"}:
            recent = (
                db.query(Invoice)
                .filter(Invoice.client_id == client.id, Invoice.total_cents == amount_paid, Invoice.currency == currency)
                .order_by(Invoice.created_at.desc())
                .first()
            )
            if recent and not recent.stripe_invoice_id and recent.status in {"PAID", "ISSUED", "SENT"}:
                recent.stripe_invoice_id = invoice_obj.get("id")
                recent.status = "PAID"
                recent.issued_at = recent.issued_at or datetime.now(timezone.utc)
                existing_invoice = recent
    if not existing_invoice:
        if client:
            invoice = issue_invoice(
                db,
                client=client,
                amount_cents=amount_paid,
                currency=currency,
                description="SoftiBridge subscription renewal",
                stripe_invoice_id=invoice_obj.get("id"),
                initial_status="PAID",
            )
        else:
            tax = evaluate_tax(
                issuer_country="IT",
                customer_country="IT",
                is_business=False,
                customer_vat_id=None,
                is_vat_exempt_declared=False,
                amount_cents=amount_paid,
            )
            invoice = Invoice(
                id=str(uuid.uuid4()),
                client_id=None,
                stripe_invoice_id=invoice_obj.get("id"),
                invoice_number=f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
                status="PAID",
                fiscal_snapshot={},
                tax_result=tax.as_dict(),
                total_cents=tax.gross_amount_cents,
                currency=currency,
                pdf_path=None,
                issued_at=datetime.now(timezone.utc),
            )
            db.add(invoice)
        invoice_entity_id = invoice.id
    else:
        existing_invoice.status = "PAID"
        existing_invoice.currency = currency
        existing_invoice.issued_at = datetime.now(timezone.utc)
        invoice_entity_id = existing_invoice.id
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="STRIPE",
        action="INVOICE_PAID",
        entity_type="INVOICE",
        entity_id=invoice_entity_id,
        details={"stripe_invoice_id": invoice_obj.get("id"), "amount_paid": amount_paid},
    ))


def _handle_subscription_change(db: Session, sub_obj: dict, event_type: str) -> None:
    stripe_sub_id = sub_obj.get("id")
    if not stripe_sub_id:
        return
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == stripe_sub_id).one_or_none()
    if not sub:
        return
    status = (sub_obj.get("status") or "").upper()
    mapped = "ACTIVE" if status in {"ACTIVE", "TRIALING"} else ("CANCELED" if "deleted" in event_type else status or "UPDATED")
    sub.status = mapped
    if sub.client_id:
        lic = db.query(License).filter(License.client_id == sub.client_id).order_by(License.created_at.desc()).first()
        if lic and mapped in {"CANCELED", "PAST_DUE", "UNPAID"}:
            lic.status = "SUSPENDED" if mapped != "CANCELED" else "EXPIRED"
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="STRIPE",
        action="SUBSCRIPTION_STATUS_CHANGED",
        entity_type="SUBSCRIPTION",
        entity_id=sub.id,
        details={"stripe_subscription_id": stripe_sub_id, "new_status": mapped},
    ))
