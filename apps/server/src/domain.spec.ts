import { countAdjustment, receptionOutcome } from "./domain";

describe("inventory domain", () => {
  it("applies the count difference instead of overwriting concurrent stock", () => {
    expect(countAdjustment("10", "8").toString()).toBe("-2");
  });

  it("keeps partial reception pending and flags the difference", () => {
    const result = receptionOutcome("5", "3");
    expect(result.status).toBe("PARTIAL");
    expect(result.difference.toString()).toBe("-2");
    expect(result.hasDifference).toBe(true);
  });
});
