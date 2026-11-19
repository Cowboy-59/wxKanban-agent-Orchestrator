/**
 * SPEC-152 (SCOPE-132 Amendment F) T005, review fix 2026-10-29 — an unknown email costs a bcrypt
 * comparison like a wrong password does, so the answer time does not reveal which emails exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ verifyPassword: vi.fn(), rows: [] as unknown[] }));

// The repo .env points at production: the user look-up reads a stub.
vi.mock("../../src/db/client.js", () => {
  const chain = { select: () => chain, from: () => chain, where: async () => h.rows };
  return { db: chain };
});
vi.mock("../../src/server/lib/password.js", () => ({ verifyPassword: h.verifyPassword }));

import { signInUser } from "../../src/server/services/userService.js";

// [SCOPE 152 / T005] BEGIN — unknown email timing (FR-064)
beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.verifyPassword.mockResolvedValue(false);
});

describe("signInUser with an unknown email", () => {
  it("still runs a bcrypt comparison, then gives the wrong-password answer", async () => {
    await expect(signInUser({ email: "Nobody@Example.com", password: "guess" })).rejects.toThrow("Invalid email or password");
    expect(h.verifyPassword).toHaveBeenCalledTimes(1);
    const [password, hash] = h.verifyPassword.mock.calls[0] as [string, string];
    expect(password).toBe("guess");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});
// [SCOPE 152 / T005] END
