import { describe, expect, it } from "vitest";
import { quantitySchema } from "@fatboy/shared";

describe("quantity contract", () => {
  it("accepts zero and rejects empty or negative inventory capture", () => {
    expect(quantitySchema.parse("0")).toBe("0");
    expect(quantitySchema.safeParse("").success).toBe(false);
    expect(quantitySchema.safeParse("-1").success).toBe(false);
  });
});
