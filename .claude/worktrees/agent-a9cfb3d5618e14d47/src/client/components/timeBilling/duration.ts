// [SCOPE 005 / T016] BEGIN — duration parsing for manual entries (FR-005)
/**
 * Parse what an ADMIN types as time into whole minutes: "1:38" (h:mm), "1.5" (decimal hours)
 * or "45m". A leading "-" makes a correction (FR-011). Returns null for anything else.
 * The server rounds up to the next 15 minutes; roundUpPreview shows what will be stored.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim();
  const sign = s.startsWith("-") ? -1 : 1;
  const body = s.replace(/^[-+]/, "");
  let minutes: number | null = null;
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(body);
  const m = /^(\d{1,4})\s*m$/i.exec(body);
  if (hm) minutes = Number(hm[1]) * 60 + Number(hm[2]);
  else if (m) minutes = Number(m[1]);
  else if (/^\d{1,2}(\.\d{1,2})?$/.test(body)) minutes = Math.round(Number(body) * 60);
  if (minutes === null || minutes === 0) return null;
  return sign * minutes;
}

/** Minutes rounded up (away from zero) to the next 15, as decimal hours "1.75". */
export function roundUpPreview(minutes: number): string {
  const rounded = Math.sign(minutes) * Math.ceil(Math.abs(minutes) / 15) * 15;
  return (rounded / 60).toFixed(2);
}

/** Seconds as h:mm:ss for the running timer. */
export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Minutes as the h:mm the entry dialog shows when editing. */
export function minutesToInput(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
// [SCOPE 005 / T016] END
