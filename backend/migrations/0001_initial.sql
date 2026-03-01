CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    brand TEXT NOT NULL,
    parent_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    fee_pct NUMERIC(6,4) NOT NULL DEFAULT 0.70,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    fee_pct NUMERIC(6,4) NOT NULL DEFAULT 0.10,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    telegram_username TEXT,
    email TEXT,
    phone TEXT,
    country_code TEXT,
    fiscal_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
    code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    billing_mode TEXT NOT NULL,
    monthly_price_cents INTEGER,
    setup_price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'EUR',
    slot_limit_total INTEGER NOT NULL,
    feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    plan_code TEXT REFERENCES plans(code) ON DELETE RESTRICT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    plan_code TEXT REFERENCES plans(code) ON DELETE RESTRICT,
    status TEXT NOT NULL,
    expiry_at TIMESTAMPTZ,
    install_id TEXT,
    mt_accounts JSONB NOT NULL DEFAULT '{"MT4":[],"MT5":[]}'::jsonb,
    signed_token_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id TEXT REFERENCES licenses(id) ON DELETE CASCADE,
    install_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT UNIQUE,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    status TEXT NOT NULL,
    paid_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    stripe_invoice_id TEXT,
    invoice_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    fiscal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    tax_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    pdf_path TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    version TEXT NOT NULL,
    platform TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS download_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    download_id UUID REFERENCES downloads(id) ON DELETE SET NULL,
    ip TEXT,
    user_agent TEXT,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    level TEXT NOT NULL DEFAULT 'INFO',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signal_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'TELEGRAM',
    source_chat_id TEXT,
    symbol_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
    parser_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_rooms_owner_user_id ON signal_rooms(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_signal_rooms_client_id ON signal_rooms(client_id);
CREATE INDEX IF NOT EXISTS idx_signal_rooms_source_chat_id ON signal_rooms(source_chat_id);

CREATE TABLE IF NOT EXISTS signal_formats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES signal_rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parser_kind TEXT NOT NULL DEFAULT 'REGEX_TEMPLATE',
    mode_hint TEXT,
    regex_pattern TEXT,
    field_map JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_formats_room_id ON signal_formats(room_id);

CREATE TABLE IF NOT EXISTS signal_parse_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES signal_rooms(id) ON DELETE SET NULL,
    source_chat_id TEXT,
    raw_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    parser_used TEXT,
    result_mode TEXT,
    confidence INTEGER NOT NULL DEFAULT 0,
    valid BOOLEAN NOT NULL DEFAULT FALSE,
    parsed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    errors JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_parse_logs_room_id ON signal_parse_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_signal_parse_logs_created_at ON signal_parse_logs(created_at);

CREATE TABLE IF NOT EXISTS invoice_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    series TEXT NOT NULL DEFAULT 'A',
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invoice_sequence_year_series UNIQUE (year, series)
);

CREATE INDEX IF NOT EXISTS idx_invoice_sequences_year ON invoice_sequences(year);

CREATE TABLE IF NOT EXISTS manual_payment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    submitted_amount_cents INTEGER,
    submitted_currency TEXT,
    reference_code TEXT,
    proof_url TEXT,
    notes TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_manual_payment_submissions_invoice_id ON manual_payment_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_submissions_client_id ON manual_payment_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_manual_payment_submissions_status ON manual_payment_submissions(status);

INSERT INTO plans (code, display_name, billing_mode, monthly_price_cents, setup_price_cents, currency, slot_limit_total, feature_flags)
VALUES
('BASIC', 'Basic', 'SUBSCRIPTION', 5900, NULL, 'EUR', 1, '{"telegram_groups":1,"mt4_mt5_accounts":1}'),
('PRO', 'Pro', 'SUBSCRIPTION', 10900, NULL, 'EUR', 3, '{"telegram_groups":3,"priority_support":true}'),
('ENTERPRISE', 'Enterprise', 'SUBSCRIPTION', 19900, NULL, 'EUR', 10, '{"telegram_groups":10,"white_label":true}')
ON CONFLICT (code) DO NOTHING;
