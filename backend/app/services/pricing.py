from dataclasses import dataclass


@dataclass(frozen=True)
class LandingPackagePricing:
    code: str
    monthly_price_cents: int
    billing_mode: str = "SUBSCRIPTION"


LANDING_PACKAGES = {
    "BASIC": LandingPackagePricing(code="BASIC", monthly_price_cents=5900),
    "PRO": LandingPackagePricing(code="PRO", monthly_price_cents=10900),
    "ENTERPRISE": LandingPackagePricing(code="ENTERPRISE", monthly_price_cents=19900),
}

