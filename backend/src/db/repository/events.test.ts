import { describe, expect, it } from "vitest";

// findEventsInRange is tested via the store layer integration-style
// because it requires a live DB. This test file validates the SQL
// construction indirectly through loadEventsInRange (Task 2).
//
// For now, verify the function exists and is callable.
describe("findEventsInRange", () => {
  it("is exported from repository", async () => {
    const mod = await import("./events");
    expect(typeof mod.findEventsInRange).toBe("function");
  });
});
