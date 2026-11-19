import { db } from "../db/client.js";
import { companies } from "~/db/schema/company.js";
import { eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "../lib/crypto.js";
import { createLogger } from "../lib/logger.js";
import type { Setting } from "~/shared/types/settings.js";

const logger = createLogger("settings-service");

// Fail-fast: validate key at module load time (server startup check)
const SETTINGS_KEY = process.env.SETTINGS_ENCRYPTION_KEY ?? "";
if (!SETTINGS_KEY || Buffer.from(SETTINGS_KEY, "utf-8").length !== 32) {
  logger.error(
    "SETTINGS_ENCRYPTION_KEY must be exactly 32 UTF-8 characters. Server cannot start without it.",
  );
  process.exit(1);
}

function encryptSettings(settings: Setting[]): string {
  return encryptToken(JSON.stringify(settings), SETTINGS_KEY);
}

function decryptSettings(ciphertext: string): Setting[] {
  try {
    return JSON.parse(decryptToken(ciphertext, SETTINGS_KEY)) as Setting[];
  } catch {
    logger.error("Failed to decrypt company settings — treating as empty");
    return [];
  }
}

export async function getCompanySettings(companyId: string): Promise<Setting[]> {
  const rows = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, companyId));

  if (!rows.length || !rows[0].settings) {
    return [];
  }

  return decryptSettings(rows[0].settings);
}

export async function addSetting(
  companyId: string,
  setting: Setting,
): Promise<Setting[]> {
  const current = await getCompanySettings(companyId);

  if (current.some((s) => s.name === setting.name)) {
    const err = new Error(`A setting named '${setting.name}' already exists.`);
    (err as Error & { code: string }).code = "SETTING_NAME_CONFLICT";
    throw err;
  }

  const updated = [...current, setting];
  await db
    .update(companies)
    .set({ settings: encryptSettings(updated), updatedat: new Date() })
    .where(eq(companies.id, companyId));

  logger.info({ companyId, name: setting.name }, "Setting added");
  return updated;
}

export async function updateSetting(
  companyId: string,
  name: string,
  patch: { value: string; description?: string },
): Promise<Setting> {
  const current = await getCompanySettings(companyId);
  const idx = current.findIndex((s) => s.name === name);

  if (idx === -1) {
    const err = new Error(`Setting '${name}' not found.`);
    (err as Error & { code: string }).code = "SETTING_NOT_FOUND";
    throw err;
  }

  const updated = current.map((s, i) =>
    i === idx
      ? {
          ...s,
          value: patch.value,
          ...(patch.description !== undefined
            ? { description: patch.description }
            : {}),
        }
      : s,
  );

  await db
    .update(companies)
    .set({ settings: encryptSettings(updated), updatedat: new Date() })
    .where(eq(companies.id, companyId));

  logger.info({ companyId, name }, "Setting updated");
  return updated[idx];
}

export async function deleteSetting(
  companyId: string,
  name: string,
): Promise<void> {
  const current = await getCompanySettings(companyId);

  if (!current.some((s) => s.name === name)) {
    const err = new Error(`Setting '${name}' not found.`);
    (err as Error & { code: string }).code = "SETTING_NOT_FOUND";
    throw err;
  }

  const updated = current.filter((s) => s.name !== name);
  await db
    .update(companies)
    .set({ settings: encryptSettings(updated), updatedat: new Date() })
    .where(eq(companies.id, companyId));

  logger.info({ companyId, name }, "Setting deleted");
}
