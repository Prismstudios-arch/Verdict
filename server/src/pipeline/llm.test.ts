import { describe, it, expect } from "vitest";
import { copySchema, findingSchema, findingsArray } from "./llm.js";

/**
 * Regression tests for LLM output tolerance. Gemini (schema-in-prompt) and
 * Claude can both return more findings than requested, omit optional fields,
 * or emit an out-of-range/stringy score. None of that must ever throw and
 * fail a whole audit — it should degrade gracefully. This guards the bug
 * where apple.com returned 7 copy findings and the strict `.max(6)` schema
 * rejected the entire response.
 */

describe("findingSchema tolerance", () => {
  it("defaults missing string fields to empty rather than throwing", () => {
    const f = findingSchema.parse({ severity: "major", issue: "Weak CTA" });
    expect(f.issue).toBe("Weak CTA");
    expect(f.evidence).toBe("");
    expect(f.rewriteAfter).toBe("");
  });

  it("falls back to 'minor' on an unknown severity", () => {
    const f = findingSchema.parse({ severity: "showstopper", issue: "x" });
    expect(f.severity).toBe("minor");
  });

  it("survives a completely malformed finding", () => {
    const f = findingSchema.parse("not an object");
    expect(f.severity).toBe("minor");
    expect(f.issue).toBe("");
  });
});

describe("copySchema tolerance", () => {
  it("accepts more findings than the intended cap without throwing", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      severity: "minor",
      issue: `Finding ${i}`,
      evidence: "",
      fix: "",
      rewriteBefore: "",
      rewriteAfter: "",
    }));
    const parsed = copySchema.parse({ copyScore: 70, verdictParagraph: "ok", findings: many });
    expect(parsed.findings.length).toBe(9); // capping happens later in code, not by rejecting
  });

  it("coerces a stringy score and tolerates out-of-range values", () => {
    expect(copySchema.parse({ copyScore: "82", verdictParagraph: "", findings: [] }).copyScore).toBe(82);
    expect(copySchema.parse({ copyScore: 140, verdictParagraph: "", findings: [] }).copyScore).toBe(140);
  });

  it("defaults a non-array findings value to []", () => {
    expect(findingsArray.parse("nope")).toEqual([]);
  });
});
