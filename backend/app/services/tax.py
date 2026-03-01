from __future__ import annotations

from dataclasses import dataclass

from app.enums import TaxTreatment


EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
    "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
    "RO", "SK", "SI", "ES", "SE",
}

# Configurabile: per MVP inseriamo esempi e fallback.
VAT_RATES = {
    "IT": 0.22,
    "ES": 0.21,
    "FR": 0.20,
    "DE": 0.19,
}


@dataclass
class TaxResult:
    treatment: TaxTreatment
    vat_rate: float
    vat_amount_cents: int
    net_amount_cents: int
    gross_amount_cents: int
    note: str
    legal_basis: str | None = None

    def as_dict(self) -> dict:
        return {
            "treatment": self.treatment.value,
            "vat_rate": self.vat_rate,
            "vat_amount_cents": self.vat_amount_cents,
            "net_amount_cents": self.net_amount_cents,
            "gross_amount_cents": self.gross_amount_cents,
            "note": self.note,
            "legal_basis": self.legal_basis,
        }


def evaluate_tax(
    *,
    issuer_country: str,
    customer_country: str,
    is_business: bool,
    customer_vat_id: str | None,
    is_vat_exempt_declared: bool,
    amount_cents: int,
) -> TaxResult:
    issuer_country = issuer_country.upper()
    customer_country = customer_country.upper()
    customer_in_eu = customer_country in EU_COUNTRIES
    issuer_in_eu = issuer_country in EU_COUNTRIES

    if is_vat_exempt_declared:
        return TaxResult(
            treatment=TaxTreatment.EXEMPT,
            vat_rate=0.0,
            vat_amount_cents=0,
            net_amount_cents=amount_cents,
            gross_amount_cents=amount_cents,
            note="Operazione esente IVA su dichiarazione/causale fiscale.",
            legal_basis="IVA ESENTE (da confermare con commercialista)",
        )

    if issuer_country == customer_country:
        vat_rate = VAT_RATES.get(customer_country, VAT_RATES.get(issuer_country, 0.22))
        vat = round(amount_cents * vat_rate)
        return TaxResult(
            treatment=TaxTreatment.TAXABLE,
            vat_rate=vat_rate,
            vat_amount_cents=vat,
            net_amount_cents=amount_cents,
            gross_amount_cents=amount_cents + vat,
            note="Operazione imponibile domestica.",
            legal_basis=None,
        )

    if issuer_in_eu and customer_in_eu and is_business and customer_vat_id:
        return TaxResult(
            treatment=TaxTreatment.REVERSE_CHARGE,
            vat_rate=0.0,
            vat_amount_cents=0,
            net_amount_cents=amount_cents,
            gross_amount_cents=amount_cents,
            note="Reverse charge intra-UE (cliente business con VAT ID).",
            legal_basis="Art. 44/196 Dir. 2006/112/CE - reverse charge intra-UE",
        )

    if issuer_in_eu and customer_in_eu:
        vat_rate = VAT_RATES.get(customer_country, VAT_RATES.get(issuer_country, 0.22))
        vat = round(amount_cents * vat_rate)
        return TaxResult(
            treatment=TaxTreatment.TAXABLE,
            vat_rate=vat_rate,
            vat_amount_cents=vat,
            net_amount_cents=amount_cents,
            gross_amount_cents=amount_cents + vat,
            note="B2C UE: IVA applicata in base al paese cliente (OSS da gestire operativamente).",
            legal_basis="OSS / IVA UE servizi digitali",
        )

    if not customer_in_eu:
        return TaxResult(
            treatment=TaxTreatment.EXEMPT,
            vat_rate=0.0,
            vat_amount_cents=0,
            net_amount_cents=amount_cents,
            gross_amount_cents=amount_cents,
            note="Operazione extra-UE (verifica regime applicabile).",
            legal_basis="Fuori campo / non imponibile (da confermare)",
        )

    vat_rate = VAT_RATES.get(issuer_country, 0.22)
    vat = round(amount_cents * vat_rate)
    return TaxResult(
        treatment=TaxTreatment.TAXABLE,
        vat_rate=vat_rate,
        vat_amount_cents=vat,
        net_amount_cents=amount_cents,
        gross_amount_cents=amount_cents + vat,
        note="Fallback imponibile.",
    )

