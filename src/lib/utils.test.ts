import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names and dedupes conflicting tailwind utilities", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
