from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.models import AuditLog, Client, Invoice, InvoiceSequence, Payment
from app.services.billing import InvoicePayload, generate_invoice_pdf
from app.services.email_service import EmailServiceError, send_email
from app.services.stripe_service import CheckoutSessionResult, create_invoice_payment_session
from app.services.tax import evaluate_tax
from app.services.telegram_service import TelegramServiceError, send_message


PAYABLE_STATUSES = {"DRAFT", "ISSUED", "SENT", "UNPAID", "PENDING_PAYMENT"}
MANUAL_METHODS = {"BANK_TRANSFER", "USDT_TRC20"}


def _invoice_meta(row: Invoice) -> dict:
    snap = dict(row.fiscal_snapshot or {})
    meta = dict(snap.get("_billing_meta") or {})
    return meta


def _set_invoice_meta(row: Invoice, **fields) -> None:
    snap = dict(row.fiscal_snapshot or {})
    meta = dict(snap.get("_billing_meta") or {})
    meta.update({k: v for k, v in fields.items() if v is not None})
    snap["_billing_meta"] = meta
    row.fiscal_snapshot = snap


def next_fiscal_invoice_number(db: Session, *, when: datetime | None = None, series: str | None = None) -> str:
    ts = when or datetime.now(timezone.utc)
    year = ts.year
    chosen_series = (series or get_settings().billing_invoice_series or "A").upper()
    seq = (
        db.query(InvoiceSequence)
        .filter(InvoiceSequence.year == year, InvoiceSequence.series == chosen_series)
        .one_or_none()
    )
    if not seq:
        seq = InvoiceSequence(id=str(uuid.uuid4()), year=year, series=chosen_series, last_number=0)
        db.add(seq)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            seq = (
                db.query(InvoiceSequence)
                .filter(InvoiceSequence.year == year, InvoiceSequence.series == chosen_series)
                .one()
            )
    seq.last_number = int(seq.last_number or 0) + 1
    db.flush()
    return f"{year}/{chosen_series}/{seq.last_number:06d}"


def issue_invoice(
    db: Session,
    *,
    client: Client,
    amount_cents: int,
    currency: str = "EUR",
    description: str,
    payment_id: str | None = None,
    stripe_invoice_id: str | None = None,
    initial_status: str = "ISSUED",
    invoice_number: str | None = None,
    document_type: str = "INVOICE",
    invoice_channel: str = "ADMIN_MANUAL",
    payment_method: str = "MANUAL",
    assign_fiscal_number: bool = True,
) -> Invoice:
    doc_type = (document_type or "INVOICE").upper()
    channel = (invoice_channel or "ADMIN_MANUAL").upper()
    pay_method = (payment_method or "MANUAL").upper()
    tax = evaluate_tax(
        issuer_country=get_settings().invoice_issuer_country,
        customer_country=(client.country_code or get_settings().invoice_issuer_country or "IT"),
        is_business=bool((client.fiscal_profile or {}).get("is_business")),
        customer_vat_id=(client.fiscal_profile or {}).get("vat_id"),
        is_vat_exempt_declared=bool((client.fiscal_profile or {}).get("vat_exempt")),
        amount_cents=amount_cents,
    )
    if invoice_number:
        inv_number = invoice_number
    elif doc_type == "INVOICE" and assign_fiscal_number:
        inv_number = next_fiscal_invoice_number(db)
    elif doc_type == "PROFORMA":
        inv_number = f"PRO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    else:
        inv_number = f"DOC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    pdf_path = generate_invoice_pdf(
        InvoicePayload(
            invoice_number=inv_number,
            customer_name=client.full_name,
            customer_email=client.email or "n/a",
            customer_country=(client.country_code or get_settings().invoice_issuer_country or "IT"),
            description=description,
            currency=(currency or "EUR").upper(),
            tax_result=tax,
        )
    )
    row = Invoice(
        id=str(uuid.uuid4()),
        client_id=client.id,
        payment_id=payment_id,
        stripe_invoice_id=stripe_invoice_id,
        invoice_number=inv_number,
        status=initial_status,
        fiscal_snapshot=dict(client.fiscal_profile or {}),
        tax_result=tax.as_dict(),
        total_cents=tax.gross_amount_cents,
        currency=(currency or "EUR").upper(),
        pdf_path=pdf_path,
        issued_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    _set_invoice_meta(
        row,
        document_type=doc_type,
        invoice_channel=channel,
        payment_method=pay_method,
        fiscal_number_assigned=(doc_type == "INVOICE" and assign_fiscal_number),
        fiscal_year=(datetime.now(timezone.utc).year if doc_type == "INVOICE" and assign_fiscal_number else None),
    )
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="INVOICE_ISSUED",
        entity_type="INVOICE",
        entity_id=row.id,
        details={
            "invoice_number": row.invoice_number,
            "client_id": client.id,
            "amount_cents": amount_cents,
            "total_cents": row.total_cents,
            "document_type": doc_type,
            "invoice_channel": channel,
            "payment_method": pay_method,
        },
    ))
    return row


def invoice_to_dict(row: Invoice, client: Client | None = None) -> dict:
    status = (row.status or "").upper()
    meta = _invoice_meta(row)
    return {
        "invoice_number": row.invoice_number,
        "status": row.status,
        "total_cents": row.total_cents,
        "currency": row.currency,
        "pdf_path": row.pdf_path,
        "pdf_url": f"/api/files/invoice/{row.invoice_number}" if row.pdf_path else None,
        "issued_at": row.issued_at.isoformat() if row.issued_at else None,
        "tax_result": row.tax_result,
        "client_id": row.client_id,
        "client_name": client.full_name if client else None,
        "client_email": client.email if client else None,
        "payable": status in PAYABLE_STATUSES,
        "can_download": bool(row.pdf_path),
        "document_type": meta.get("document_type", "INVOICE"),
        "invoice_channel": meta.get("invoice_channel"),
        "payment_method": meta.get("payment_method"),
        "fiscal_number_assigned": bool(meta.get("fiscal_number_assigned")),
    }


def ensure_invoice_payment_record(db: Session, *, invoice: Invoice, client: Client) -> Payment:
    if invoice.payment_id:
        existing = db.query(Payment).filter(Payment.id == invoice.payment_id).one_or_none()
        if existing:
            return existing
    row = Payment(
        id=str(uuid.uuid4()),
        client_id=client.id,
        subscription_id=None,
        amount_cents=invoice.total_cents,
        currency=invoice.currency,
        status="PENDING",
        metadata_json={
            "invoice_number": invoice.invoice_number,
            "billing_kind": "INVOICE_PAYMENT",
            "payment_method": _invoice_meta(invoice).get("payment_method", "STRIPE"),
        },
    )
    db.add(row)
    db.flush()
    invoice.payment_id = row.id
    return row


def create_invoice_pay_link(db: Session, *, invoice: Invoice, client: Client) -> tuple[CheckoutSessionResult, Payment]:
    _set_invoice_meta(invoice, payment_method="STRIPE", invoice_channel=_invoice_meta(invoice).get("invoice_channel", "AUTO_STRIPE"))
    payment = ensure_invoice_payment_record(db, invoice=invoice, client=client)
    result = create_invoice_payment_session(
        invoice_number=invoice.invoice_number,
        customer_email=client.email or f"client+{client.id}@softibridge.local",
        amount_cents=invoice.total_cents,
        currency=invoice.currency,
        description=f"Pagamento fattura {invoice.invoice_number} - SoftiBridge",
        metadata={
            "billing_kind": "INVOICE_PAYMENT",
            "invoice_number": invoice.invoice_number,
            "client_id": client.id,
        },
    )
    payment.stripe_checkout_session_id = result.session_id or payment.stripe_checkout_session_id
    if payment.status != "PAID":
        payment.status = "PENDING"
    invoice.status = "PENDING_PAYMENT" if result.simulated else ("SENT" if (invoice.status or "").upper() in {"ISSUED", "UNPAID"} else invoice.status)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="INVOICE_PAY_LINK_CREATED",
        entity_type="INVOICE",
        entity_id=invoice.id,
        details={"invoice_number": invoice.invoice_number, "payment_id": payment.id, "simulated": result.simulated},
    ))
    return result, payment


def mark_invoice_paid(db: Session, *, invoice: Invoice, actor_type: str = "SYSTEM", actor_id: str | None = None, payment: Payment | None = None) -> Invoice:
    meta = _invoice_meta(invoice)
    if meta.get("document_type") == "PROFORMA":
        promote_proforma_to_invoice(db, invoice=invoice)
        meta = _invoice_meta(invoice)
    invoice.status = "PAID"
    if not invoice.issued_at:
        invoice.issued_at = datetime.now(timezone.utc)
    if invoice.payment_id:
        payment = payment or db.query(Payment).filter(Payment.id == invoice.payment_id).one_or_none()
    if payment:
        payment.status = "PAID"
        payment.paid_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type=actor_type,
        actor_id=actor_id,
        action="INVOICE_MARKED_PAID",
        entity_type="INVOICE",
        entity_id=invoice.id,
        details={"invoice_number": invoice.invoice_number, "payment_id": invoice.payment_id},
    ))
    return invoice


def promote_proforma_to_invoice(
    db: Session,
    *,
    invoice: Invoice,
    invoice_channel: str | None = None,
    payment_method: str | None = None,
) -> Invoice:
    meta = _invoice_meta(invoice)
    if (meta.get("document_type") or "").upper() == "INVOICE" and meta.get("fiscal_number_assigned"):
        return invoice
    old_number = invoice.invoice_number
    invoice.invoice_number = next_fiscal_invoice_number(db)
    _set_invoice_meta(
        invoice,
        document_type="INVOICE",
        fiscal_number_assigned=True,
        invoice_channel=(invoice_channel or meta.get("invoice_channel") or "ADMIN_MANUAL"),
        payment_method=(payment_method or meta.get("payment_method") or "MANUAL"),
        proforma_origin_number=old_number,
    )
    invoice.issued_at = invoice.issued_at or datetime.now(timezone.utc)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="PROFORMA_PROMOTED_TO_INVOICE",
        entity_type="INVOICE",
        entity_id=invoice.id,
        details={"old_number": old_number, "new_number": invoice.invoice_number},
    ))
    return invoice


def send_invoice_notification(db: Session, *, invoice: Invoice, client: Client, actor_type: str = "ADMIN", actor_id: str | None = None) -> dict:
    settings = get_settings()
    text = (
        f"🧾 Fattura disponibile\n"
        f"Cliente: {client.full_name}\n"
        f"Documento: {invoice.invoice_number}\n"
        f"Totale: {invoice.currency} {invoice.total_cents/100:.2f}\n"
        f"Scarica dal pannello cliente SoftiBridge."
    )
    send_result: dict = {"ok": False, "delivered": False, "channels": []}
    delivered = False
    if client.email:
        try:
            email_res = send_email(
                to_email=client.email,
                subject=f"SoftiBridge - Documento {invoice.invoice_number}",
                body_text=(
                    f"Ciao {client.full_name},\n\n"
                    f"Il documento {invoice.invoice_number} è disponibile.\n"
                    f"Totale: {invoice.currency} {invoice.total_cents/100:.2f}\n\n"
                    f"Puoi scaricarlo e pagarlo dal pannello cliente SoftiBridge."
                ),
                attachments=[invoice.pdf_path] if invoice.pdf_path else [],
            )
            send_result["channels"].append({"channel": "email", "ok": email_res.ok, "simulated": email_res.simulated, "detail": email_res.detail})
            delivered = delivered or email_res.ok
        except EmailServiceError as exc:
            send_result["channels"].append({"channel": "email", "ok": False, "error": str(exc)})
    target_chat = (client.fiscal_profile or {}).get("telegram_chat_id") or settings.telegram_admin_super_chat_id
    if target_chat:
        try:
            result = send_message(str(target_chat), text)
            send_result["channels"].append({"channel": "telegram", "ok": result.ok, "simulated": result.simulated, "target": str(target_chat)})
            delivered = delivered or result.ok
        except TelegramServiceError as exc:
            send_result["channels"].append({"channel": "telegram", "ok": False, "error": str(exc)})
    if not send_result["channels"]:
        send_result["channels"].append({"channel": "audit_only", "ok": False})
    send_result["ok"] = delivered
    send_result["delivered"] = delivered
    invoice.status = "SENT" if (invoice.status or "").upper() in {"ISSUED", "UNPAID", "PENDING_PAYMENT"} else invoice.status
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type=actor_type,
        actor_id=actor_id,
        action="INVOICE_NOTIFICATION_SENT",
        entity_type="INVOICE",
        entity_id=invoice.id,
        details={"invoice_number": invoice.invoice_number, "send_result": send_result},
    ))
    return send_result


def get_manual_payment_instructions(*, method: str, invoice: Invoice) -> dict:
    settings = get_settings()
    method_u = (method or "").upper()
    if method_u == "BANK_TRANSFER":
        reason = (settings.bank_payment_reason_template or "SOFTIBRIDGE {invoice_number}").replace("{invoice_number}", invoice.invoice_number)
        return {
            "method": "BANK_TRANSFER",
            "bank_account_name": settings.bank_account_name,
            "bank_name": settings.bank_name,
            "iban": settings.bank_iban,
            "bic_swift": settings.bank_bic_swift,
            "payment_reason": reason,
            "amount_cents": invoice.total_cents,
            "currency": invoice.currency,
        }
    if method_u == "USDT_TRC20":
        return {
            "method": "USDT_TRC20",
            "network": settings.usdt_tron_network_label or "TRC20",
            "wallet_address": settings.usdt_tron_wallet_address,
            "amount_cents_reference": invoice.total_cents,
            "currency_reference": invoice.currency,
            "buffer_pct": settings.usdt_price_buffer_pct,
            "invoice_number": invoice.invoice_number,
        }
    raise ValueError("Metodo manuale non supportato")
