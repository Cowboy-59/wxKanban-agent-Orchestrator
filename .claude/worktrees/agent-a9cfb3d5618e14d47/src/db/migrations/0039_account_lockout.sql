-- 0039: Account lockout (SOC 2 CC6.1 — brute-force protection / M-12)
-- Track consecutive failed login attempts and lock the account after a
-- threshold (enforced in code: 3 attempts -> 15-minute lock). Columns are
-- additive and backward-compatible: existing code ignores them.
ALTER TABLE userprofiles ADD COLUMN IF NOT EXISTS failedlogins integer NOT NULL DEFAULT 0;
ALTER TABLE userprofiles ADD COLUMN IF NOT EXISTS lockeduntil timestamp;
