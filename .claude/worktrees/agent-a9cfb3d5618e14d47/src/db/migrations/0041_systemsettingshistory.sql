-- 0041: Create systemsettingshistory (SCOPE-067 follow-up)
-- The SysAdmin settings audit trail referenced a table that never existed on
-- the DB. The settings table itself is `systemsettings` (already present); this
-- adds the missing history table, following the project no-underscore naming.
CREATE TABLE IF NOT EXISTS systemsettingshistory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settingid     uuid NOT NULL REFERENCES systemsettings(id) ON DELETE CASCADE,
  previousvalue jsonb,
  newvalue      jsonb NOT NULL,
  changedat     timestamp DEFAULT now(),
  changedby     uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  changereason  text
);
CREATE INDEX IF NOT EXISTS idx_systemsettingshistory_settingid ON systemsettingshistory(settingid);
