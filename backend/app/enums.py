from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN_WL = "ADMIN_WL"
    AFFILIATE = "AFFILIATE"
    CLIENT = "CLIENT"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


class LicenseStatus(str, Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    GRACE_REPLACEMENT = "GRACE_REPLACEMENT"
    REPLACED = "REPLACED"
    SUSPENDED = "SUSPENDED"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class TaxTreatment(str, Enum):
    TAXABLE = "TAXABLE"
    REVERSE_CHARGE = "REVERSE_CHARGE"
    EXEMPT = "EXEMPT"
