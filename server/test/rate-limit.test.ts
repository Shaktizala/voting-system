/**
 * Rate-limit keying: at a live event many participants share one venue/NAT IP,
 * so limits must be keyed by user (or login identifier) — not by IP. These unit
 * tests guard that behaviour; the limiters themselves are disabled under test.
 */
import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { userKey, loginKey } from "../src/middleware/rateLimit";

const req = (over: Record<string, unknown>) => over as unknown as Request;

describe("rate limit keying", () => {
  it("keys authenticated requests by user, not IP", () => {
    const sharedIp = "203.0.113.7";
    const a = userKey(req({ ip: sharedIp, user: { id: "user-a" } }));
    const b = userKey(req({ ip: sharedIp, user: { id: "user-b" } }));
    expect(a).toBe("u:user-a");
    expect(b).toBe("u:user-b");
    expect(a).not.toBe(b); // same Wi-Fi IP must not share a bucket
  });

  it("falls back to IP for anonymous requests", () => {
    expect(userKey(req({ ip: "198.51.100.9" }))).toBe("ip:198.51.100.9");
  });

  it("keys login by account so a shared IP can't lock out other accounts", () => {
    const sharedIp = "203.0.113.7";
    const alice = loginKey(req({ ip: sharedIp, body: { identifier: "Alice" } }));
    const bob = loginKey(req({ ip: sharedIp, body: { identifier: "bob" } }));
    expect(alice).toBe("login:alice");
    expect(bob).toBe("login:bob");
    expect(alice).not.toBe(bob);
    // same account from a different IP maps to the same bucket
    expect(loginKey(req({ ip: "10.0.0.1", body: { identifier: "alice" } }))).toBe(alice);
  });

  it("falls back to IP when no identifier is supplied", () => {
    expect(loginKey(req({ ip: "198.51.100.9", body: {} }))).toBe("ip:198.51.100.9");
    expect(loginKey(req({ ip: "198.51.100.9" }))).toBe("ip:198.51.100.9");
  });
});
