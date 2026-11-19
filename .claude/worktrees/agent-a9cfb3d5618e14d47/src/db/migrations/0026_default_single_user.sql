-- 0026: Default companies.billingplan to SINGLE_USER (no more FREE signups)
-- "No one is free anymore" — the public signup default tier is now SINGLE_USER.
-- FREE remains a valid value for internal/legacy/billing-exempt accounts; this
-- only changes the column default applied when an insert omits billingplan.
-- Registration always sets the plan explicitly, so this is belt-and-suspenders.
-- (Also corrects pre-existing drift: the DB default was the mixed-case 'Free'.)
ALTER TABLE companies ALTER COLUMN billingplan SET DEFAULT 'SINGLE_USER';
