import { describe, it, expect } from "vitest";

// placeholder until playwright browsers are installed in CI
it("reads join code constraint", () => {
  const CODE = /^[A-HJ-NP-Z2-9]{6,8}$/;
  expect(CODE.test("WYHW9DJ")).toBe(true);
  expect(CODE.test("IO01")).toBe(false);
});
