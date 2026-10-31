import { describe, expect, it } from "vitest";
import { formatUsd, parseUsd } from "../../src/shared/money";
import { rankStandings, revealVisibility, type StandingInput } from "../../src/shared/rules";

const row = (teamId: string, profiles: number, total: number, creditsLeft: number, disqualified = false): StandingInput => ({
  teamId,
  profiles,
  total,
  creditsLeft,
  disqualified,
});
const ranks = (rows: StandingInput[]) => rankStandings(rows).map((r) => [r.teamId, r.rank, r.winner]);

describe("winner = combined actual annual salary (client rule, 1 Nov 2026)", () => {
  it("the client's example: 3 profiles worth $431,000 beat 4 profiles worth $400,000", () => {
    expect(ranks([row("B", 4, 400_000, 2000), row("A", 3, 431_000, 1000)])).toEqual([
      ["A", 1, true],
      ["B", 2, false],
    ]);
  });

  it("never deducts credits from the salary total and ignores how many profiles were bought", () => {
    // A spent almost everything (1 credit left) but still has the higher salary total.
    const out = rankStandings([row("A", 1, 250_000, 1), row("B", 6, 249_999, 24_000)]);
    expect(out[0]).toMatchObject({ teamId: "A", total: 250_000, rank: 1, winner: true });
  });

  it("breaks a salary tie with more auction credits remaining", () => {
    expect(ranks([row("A", 3, 300_000, 4000), row("B", 3, 300_000, 9000), row("C", 2, 100_000, 20_000)])).toEqual([
      ["B", 1, true],
      ["A", 2, false],
      ["C", 3, false],
    ]);
  });

  it("declares joint winners when salary and credits are both tied (competition ranking 1, 1, 3)", () => {
    expect(ranks([row("A", 3, 300_000, 5000), row("B", 2, 300_000, 5000), row("C", 4, 299_000, 25_000)])).toEqual([
      ["A", 1, true],
      ["B", 1, true],
      ["C", 3, false],
    ]);
  });

  it("does not rank teams disqualified for the minimum squad, even with the highest total", () => {
    const out = rankStandings([row("DQ", 2, 900_000, 3000, true), row("A", 3, 200_000, 1000)]);
    expect(out.map((r) => [r.teamId, r.rank, r.winner])).toEqual([
      ["A", 1, true],
      ["DQ", null, false],
    ]);
  });

  it("has no winner while every total is zero", () => {
    expect(rankStandings([row("A", 0, 0, 25_000), row("B", 0, 0, 25_000)]).some((r) => r.winner)).toBe(false);
  });
});

describe("final reveal visibility", () => {
  const order = ["p1", "p2", "p3"];
  it("hides everything before the reveal starts", () => {
    const v = revealVisibility("NOT_STARTED", [], 0, 0);
    expect(v.visibleStep("p1")).toBe(-1);
  });
  it("shows earlier profiles completely, the current one up to its step and later ones not at all", () => {
    const v = revealVisibility("IN_PROGRESS", order, 1, 2);
    expect(v.visibleStep("p1")).toBe(4);
    expect(v.visibleStep("p2")).toBe(2);
    expect(v.visibleStep("p3")).toBe(-1);
    expect(v.visibleStep("unsold-profile")).toBe(-1);
  });
  it("shows every purchased profile once the reveal is complete", () => {
    expect(revealVisibility("COMPLETE", order, 2, 4).visibleStep("p3")).toBe(4);
  });
});

describe("annual salary input (whole US dollars)", () => {
  it("accepts the usual ways of writing an amount", () => {
    expect(parseUsd("120000")).toBe(120000);
    expect(parseUsd("$120,000")).toBe(120000);
    expect(parseUsd(" 95,500.00 ")).toBe(95500);
    expect(parseUsd("USD 95000")).toBe(95000);
    expect(parseUsd(431000)).toBe(431000);
  });
  it("rejects cents, negatives, zero and text", () => {
    for (const bad of ["120000.50", "-5", "0", "abc", "", "1e5", "12 0000x"]) expect(parseUsd(bad)).toBeNull();
    expect(parseUsd(1.5)).toBeNull();
  });
  it("formats with thousands separators", () => {
    expect(formatUsd(431000)).toBe("$431,000");
    expect(formatUsd(null)).toBe("—");
  });
});
