import { describe, it, expect } from "vitest";
import { compositeScore, letterGrade } from "./score.js";

describe("compositeScore", () => {
  it("is deterministic and weighted per the brief", () => {
    const s = { clarity: 80, copy: 70, mobile: 90, performance: 60, trust: 50, accessibility: 100 };
    // 80*.25 + 70*.25 + 90*.20 + 60*.15 + 50*.10 + 100*.05 = 74.5 → 75 (banker-free round)
    expect(compositeScore(s)).toBe(75);
    expect(compositeScore(s)).toBe(compositeScore({ ...s }));
  });

  it("returns 100 for perfect and 0 for zero", () => {
    const perfect = { clarity: 100, copy: 100, mobile: 100, performance: 100, trust: 100, accessibility: 100 };
    const zero = { clarity: 0, copy: 0, mobile: 0, performance: 0, trust: 0, accessibility: 0 };
    expect(compositeScore(perfect)).toBe(100);
    expect(compositeScore(zero)).toBe(0);
  });
});

describe("letterGrade", () => {
  it("maps boundaries correctly", () => {
    expect(letterGrade(100)).toBe("A+");
    expect(letterGrade(95)).toBe("A+");
    expect(letterGrade(94)).toBe("A");
    expect(letterGrade(85)).toBe("A-");
    expect(letterGrade(80)).toBe("B+");
    expect(letterGrade(70)).toBe("B-");
    expect(letterGrade(60)).toBe("C");
    expect(letterGrade(45)).toBe("D");
    expect(letterGrade(44)).toBe("F");
    expect(letterGrade(0)).toBe("F");
  });
});
