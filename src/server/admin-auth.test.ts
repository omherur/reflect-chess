import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adminCookieToken, adminEnabled, verifyAdminKey } from "./admin-auth";

/**
 * The admin gate is the only thing standing between a signed-in stranger and
 * every user's name and email address, and login is password-less — so these
 * cases are the whole security model, not edge cases.
 */

const VALID_KEY = "a-sufficiently-long-admin-key";
const original = process.env.ADMIN_KEY;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env.ADMIN_KEY = original;
  vi.restoreAllMocks();
});

describe("when ADMIN_KEY is not configured", () => {
  it("fails closed — nobody is an admin", () => {
    delete process.env.ADMIN_KEY;
    expect(adminEnabled()).toBe(false);
    expect(adminCookieToken()).toBeNull();
    expect(verifyAdminKey("")).toBe(false);
    expect(verifyAdminKey("anything")).toBe(false);
  });

  it("treats an empty or whitespace-only key as unset", () => {
    process.env.ADMIN_KEY = "   ";
    expect(adminEnabled()).toBe(false);
    expect(verifyAdminKey("   ")).toBe(false);
  });

  it("refuses a key short enough to guess", () => {
    process.env.ADMIN_KEY = "short";
    expect(adminEnabled()).toBe(false);
    // Critically, submitting the correct-but-too-short key still fails.
    expect(verifyAdminKey("short")).toBe(false);
  });
});

describe("when ADMIN_KEY is configured", () => {
  beforeEach(() => {
    process.env.ADMIN_KEY = VALID_KEY;
  });

  it("accepts the exact key", () => {
    expect(adminEnabled()).toBe(true);
    expect(verifyAdminKey(VALID_KEY)).toBe(true);
  });

  it.each([
    ["wrong key", "not-the-admin-key-at-all"],
    ["empty", ""],
    ["a prefix of the key", VALID_KEY.slice(0, -1)],
    ["the key plus a character", `${VALID_KEY}x`],
    ["different case", VALID_KEY.toUpperCase()],
    ["surrounding whitespace", ` ${VALID_KEY} `],
  ])("rejects %s", (_label, submitted) => {
    expect(verifyAdminKey(submitted)).toBe(false);
  });

  it("derives a cookie token that is not the key itself", () => {
    const token = adminCookieToken();
    expect(token).toBeTruthy();
    expect(token).not.toBe(VALID_KEY);
    expect(token).not.toContain(VALID_KEY);
    // A leaked cookie must not be usable as the key.
    expect(verifyAdminKey(token!)).toBe(false);
  });

  it("derives the same token every time, so a cookie survives a restart", () => {
    expect(adminCookieToken()).toBe(adminCookieToken());
  });

  it("derives a different token for a different key", () => {
    const first = adminCookieToken();
    process.env.ADMIN_KEY = "a-completely-different-admin-key";
    expect(adminCookieToken()).not.toBe(first);
  });
});
