import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { adminEmails, adminEnabled, isAdminUser } from "./admin-auth";

/**
 * The allowlist is the only thing standing between a signed-in stranger and
 * every user's name and email address, so these cases are the whole security
 * model rather than edge cases.
 *
 * The email compared here is the one Supabase authenticated and mirrored onto
 * the local row — not anything the user can type — which is what makes an
 * identity check meaningful now that login has a password behind it.
 */

const ADMIN = "om.herur@gmail.com";
const original = process.env.ADMIN_EMAILS;

const user = (email: string | null) => ({ email });

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

describe("when ADMIN_EMAILS is not configured", () => {
  it("fails closed — nobody is an admin", () => {
    delete process.env.ADMIN_EMAILS;
    expect(adminEnabled()).toBe(false);
    expect(isAdminUser(user(ADMIN))).toBe(false);
    expect(isAdminUser(user("anyone@example.com"))).toBe(false);
  });

  it("treats an empty or comma-only value as unset", () => {
    process.env.ADMIN_EMAILS = " , , ";
    expect(adminEnabled()).toBe(false);
    expect(isAdminUser(user(ADMIN))).toBe(false);
  });
});

describe("with a single admin email configured", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ADMIN;
  });

  it("admits exactly that address", () => {
    expect(adminEnabled()).toBe(true);
    expect(isAdminUser(user(ADMIN))).toBe(true);
  });

  it.each([
    ["a different address", "someone.else@gmail.com"],
    ["same local part, different domain", "om.herur@example.com"],
    ["same domain, different local part", "not.om@gmail.com"],
    ["a superstring", `x${ADMIN}`],
    ["a substring", "om.herur@gmail.co"],
    ["gmail dot-trick variant", "omherur@gmail.com"],
    ["plus-addressed variant", "om.herur+admin@gmail.com"],
  ])("rejects %s", (_label, email) => {
    expect(isAdminUser(user(email))).toBe(false);
  });

  it("ignores casing and surrounding whitespace, as sign-in would", () => {
    expect(isAdminUser(user("  OM.Herur@Gmail.COM  "))).toBe(true);
  });

  it("rejects a user with no email and a missing user", () => {
    expect(isAdminUser(user(null))).toBe(false);
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
});

describe("with several admin emails configured", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = ` ${ADMIN} , Second.Admin@Example.com `;
  });

  it("parses and normalizes the whole list", () => {
    expect(adminEmails()).toEqual([ADMIN, "second.admin@example.com"]);
  });

  it("admits every listed address and nobody else", () => {
    expect(isAdminUser(user(ADMIN))).toBe(true);
    expect(isAdminUser(user("second.admin@example.com"))).toBe(true);
    expect(isAdminUser(user("third@example.com"))).toBe(false);
  });
});
