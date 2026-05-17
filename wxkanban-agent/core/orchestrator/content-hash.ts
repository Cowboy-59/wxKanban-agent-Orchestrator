import { createHash } from "crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashFencedBody(bodyLines: string[]): string {
  const joined = bodyLines.join("\n");
  return sha256(joined);
}

export function isDriftDetected(
  currentBody: string,
  recordedHash: string,
): boolean {
  return sha256(currentBody) !== recordedHash;
}
