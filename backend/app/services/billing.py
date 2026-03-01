from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.config import get_settings
from app.services.tax import TaxResult


@dataclass
class InvoicePayload:
    invoice_number: str
    customer_name: str
    customer_email: str
    customer_country: str
    description: str
    currency: str
    tax_result: TaxResult


def ensure_invoice_dir() -> str:
    settings = get_settings()
    os.makedirs(settings.invoice_output_dir, exist_ok=True)
    return settings.invoice_output_dir


def generate_invoice_pdf(payload: InvoicePayload) -> str:
    settings = get_settings()
    out_dir = ensure_invoice_dir()
    file_path = os.path.join(out_dir, f"{payload.invoice_number}.pdf")

    c = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4
    y = height - 50

    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, y, settings.invoice_issuer_name)
    y -= 25
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Paese emittente: {settings.invoice_issuer_country}")
    y -= 15
    if settings.invoice_issuer_vat_id:
        c.drawString(40, y, f"VAT ID emittente: {settings.invoice_issuer_vat_id}")
        y -= 15

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y - 10, f"Fattura / Ricevuta #{payload.invoice_number}")
    y -= 35
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Data emissione: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    y -= 20
    c.drawString(40, y, f"Cliente: {payload.customer_name}")
    y -= 15
    c.drawString(40, y, f"Email: {payload.customer_email}")
    y -= 15
    c.drawString(40, y, f"Paese cliente: {payload.customer_country}")
    y -= 30

    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "Descrizione")
    c.drawString(280, y, "Netto")
    c.drawString(360, y, "IVA")
    c.drawString(440, y, "Totale")
    y -= 15
    c.line(40, y, width - 40, y)
    y -= 20

    c.setFont("Helvetica", 10)
    c.drawString(40, y, payload.description)
    c.drawRightString(340, y, _money(payload.tax_result.net_amount_cents, payload.currency))
    c.drawRightString(420, y, _money(payload.tax_result.vat_amount_cents, payload.currency))
    c.drawRightString(520, y, _money(payload.tax_result.gross_amount_cents, payload.currency))
    y -= 35

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, f"Trattamento IVA: {payload.tax_result.treatment.value}")
    y -= 15
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Aliquota IVA: {payload.tax_result.vat_rate * 100:.2f}%")
    y -= 15
    c.drawString(40, y, f"Nota: {payload.tax_result.note}")
    y -= 15
    if payload.tax_result.legal_basis:
        c.drawString(40, y, f"Riferimento: {payload.tax_result.legal_basis}")

    c.showPage()
    c.save()
    return file_path


def _money(cents: int, currency: str) -> str:
    return f"{currency} {cents/100:.2f}"

