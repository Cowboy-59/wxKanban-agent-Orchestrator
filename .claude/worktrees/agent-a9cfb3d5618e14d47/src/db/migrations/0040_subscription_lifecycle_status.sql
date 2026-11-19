-- 0040: Subscription lifecycle status normalization (SCOPE-067)
-- companies.subscriptionstatus is a varchar (no DB enum), so no type change.
-- 1) Standardize the canceled spelling on Stripe's 'CANCELED' (was mixed with 'CANCELLED').
-- 2) Map the legacy 'PAST_DUE' failure status onto the new canonical 'PENDING_INACTIVE'
--    (none expected today, but the webhook previously wrote PAST_DUE).
UPDATE companies SET subscriptionstatus = 'CANCELED'         WHERE subscriptionstatus = 'CANCELLED';
UPDATE companies SET subscriptionstatus = 'PENDING_INACTIVE' WHERE subscriptionstatus = 'PAST_DUE';
