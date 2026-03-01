import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuditLog, Plan
from app.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    InvoicePreviewRequest,
    PlanOut,
    TaxEvaluationRequest,
    TaxEvaluationResponse,
)
from app.services.billing import InvoicePayload, generate_invoice_pdf
from app.services.stripe_service import create_checkout_session
from app.services.tax import evaluate_tax

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/auth/providers")
def auth_providers():
    s = get_settings()
    return {
        "clerk": {
            "enabled": bool(s.clerk_enabled and s.clerk_publishable_key),
            "publishable_key": s.clerk_publishable_key,
            "issuer": s.clerk_issuer,
            "audience": s.clerk_audience,
        }
    }


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)) -> list[PlanOut]:
    plans = db.query(Plan).filter(Plan.active.is_(True)).order_by(Plan.monthly_price_cents.asc()).all()
    return [PlanOut.model_validate(p, from_attributes=True) for p in plans]


@router.post("/checkout/session", response_model=CheckoutResponse)
def create_checkout(req: CheckoutRequest, db: Session = Depends(get_db)) -> CheckoutResponse:
    plan = db.query(Plan).filter(Plan.code == req.plan_code, Plan.active.is_(True)).one_or_none()
    if not plan or not plan.monthly_price_cents:
        raise HTTPException(status_code=400, detail="Plan non disponibile")

    tax = evaluate_tax(
        issuer_country="IT",
        customer_country=req.country_code or "IT",
        is_business=bool(req.fiscal_profile.get("is_business")),
        customer_vat_id=req.fiscal_profile.get("vat_id"),
        is_vat_exempt_declared=bool(req.fiscal_profile.get("vat_exempt")),
        amount_cents=plan.monthly_price_cents,
    )
    metadata = {
        "plan_code": req.plan_code,
        "country_code": (req.country_code or "").upper(),
        "referral_code": req.referral_code or "",
        "full_name": req.full_name or "",
        "company_name": (req.fiscal_profile or {}).get("company_name", ""),
        "is_business": "true" if (req.fiscal_profile or {}).get("is_business") else "false",
        "customer_vat_id": (req.fiscal_profile or {}).get("vat_id", ""),
        "vat_exempt": "true" if (req.fiscal_profile or {}).get("vat_exempt") else "false",
        "tax_treatment": tax.treatment.value,
        "requested_at": datetime.utcnow().isoformat(),
    }
    session = create_checkout_session(
        plan_code=req.plan_code,
        unit_amount_cents=plan.monthly_price_cents,
        customer_email=req.email,
        metadata=metadata,
    )

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="PUBLIC",
        action="CHECKOUT_SESSION_CREATED",
        entity_type="PLAN",
        entity_id=plan.code,
        details={"email": req.email, "simulated": session.simulated, "tax": tax.as_dict()},
    ))
    db.commit()

    return CheckoutResponse(checkout_url=session.url, mode=plan.billing_mode.lower(), simulated=session.simulated)


@router.post("/tax/evaluate", response_model=TaxEvaluationResponse)
def tax_evaluate(req: TaxEvaluationRequest) -> TaxEvaluationResponse:
    result = evaluate_tax(
        issuer_country=req.issuer_country,
        customer_country=req.customer_country,
        is_business=req.is_business,
        customer_vat_id=req.customer_vat_id,
        is_vat_exempt_declared=req.is_vat_exempt_declared,
        amount_cents=req.amount_cents,
    )
    return TaxEvaluationResponse(**result.as_dict())


@router.post("/invoice/preview")
def invoice_preview(req: InvoicePreviewRequest):
    tax = evaluate_tax(
        issuer_country="IT",
        customer_country=req.customer_country,
        is_business=req.is_business,
        customer_vat_id=req.customer_vat_id,
        is_vat_exempt_declared=req.is_vat_exempt_declared,
        amount_cents=req.amount_cents,
    )
    invoice_number = f"PREVIEW-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    pdf_path = generate_invoice_pdf(
        InvoicePayload(
            invoice_number=invoice_number,
            customer_name=req.customer_name,
            customer_email=req.customer_email,
            customer_country=req.customer_country.upper(),
            description=req.description,
            currency=req.currency,
            tax_result=tax,
        )
    )
    return {"invoice_number": invoice_number, "pdf_path": pdf_path, "tax": tax.as_dict()}
