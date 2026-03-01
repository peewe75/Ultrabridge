ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_clerk_user_id ON users(clerk_user_id);

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS replaced_from_license_id TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS replaced_by_license_id TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS replacement_reason TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activation_code_hash TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activation_code_expires_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS activation_code_used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_licenses_replaced_from ON licenses(replaced_from_license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_replaced_by ON licenses(replaced_by_license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_activation_code_hash ON licenses(activation_code_hash);
