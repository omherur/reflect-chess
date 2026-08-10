import { describe, it, expect } from "vitest";
import { isValidEmail, normalizeEmail, MAX_EMAIL_LENGTH } from "./email";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  me@example.com  ")).toBe("me@example.com");
  });

  it("lowercases, so casing variants collapse to one signup", () => {
    expect(normalizeEmail("Me@Example.COM")).toBe("me@example.com");
  });

  it("maps the variants a single person would type to the same key", () => {
    const variants = ["me@example.com", " me@Example.com", "ME@EXAMPLE.COM "];
    const normalized = new Set(variants.map(normalizeEmail));
    expect(normalized.size).toBe(1);
  });
});

describe("isValidEmail", () => {
  it.each([
    "me@example.com",
    "first.last@example.com",
    "first+chess@example.co.uk",
    "a@b.io",
    "user_name-123@sub.domain.example.org",
    "  spaced@example.com  ", // normalized before checking
  ])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["no @", "example.com"],
    ["no domain", "me@"],
    ["no local part", "@example.com"],
    ["no dot in domain", "me@example"],
    ["single-letter TLD", "me@example.c"],
    ["numeric TLD", "me@example.12"],
    ["internal space", "me name@example.com"],
    ["two @", "me@@example.com"],
    ["consecutive dots", "me..name@example.com"],
    ["trailing dot", "me@example.com."],
    ["leading dot in domain", "me@.example.com"],
  ])("rejects %s", (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it("rejects an address longer than the practical maximum", () => {
    const tooLong = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
    expect(tooLong.length).toBeGreaterThan(MAX_EMAIL_LENGTH);
    expect(isValidEmail(tooLong)).toBe(false);
  });

  it("accepts an address exactly at the maximum length", () => {
    const domain = "@example.com";
    const atLimit = `${"a".repeat(MAX_EMAIL_LENGTH - domain.length)}${domain}`;
    expect(atLimit.length).toBe(MAX_EMAIL_LENGTH);
    expect(isValidEmail(atLimit)).toBe(true);
  });
});
