import { describe, expect, it } from "vitest";
import { formatMoney, multipleOfBase, parseMillions, toMillionsString } from "../../src/shared/money";
import {
  checkBid,
  isBelowMinimumSquad,
  maxBid,
  minimumLegalBid,
  orderTeamsForDisplay,
  quickAmounts,
  reservedForMandatorySlots,
  setupIssues,
  suggestedNextBid,
  type BidContext,
} from "../../src/shared/rules";

// The client's event: $25M purse, $1M base, $1M step, squad 3–9 (video 03:16).
const cfg = { basePrice: 1000, bidIncrement: 1000, minSquad: 3, maxSquad: 9 };

describe("money", () => {
  it("formats k-units as millions like the event screen", () => {
    expect(formatMoney(25000)).toBe("$25M");
    expect(formatMoney(2000)).toBe("$2M");
    expect(formatMoney(4500)).toBe("$4.5M");
    expect(formatMoney(10250)).toBe("$10.25M");
    expect(formatMoney(500)).toBe("$500K");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(3000, "₹")).toBe("₹3M");
    expect(toMillionsString(23000)).toBe("23");
  });

  it("reads typed amounts as MILLIONS (the reference tool rejected '10' — video 08:06)", () => {
    expect(parseMillions("10")).toBe(10000);
    expect(parseMillions("23")).toBe(23000);
    expect(parseMillions("$10M")).toBe(10000);
    expect(parseMillions(" 10 million ")).toBe(10000);
    expect(parseMillions("4.5")).toBe(4500);
    expect(parseMillions("1,000")).toBe(1000000);
    expect(parseMillions(7)).toBe(7000);
    for (const bad of ["", "abc", "-1", "0", "1.2345", "1e3", null, undefined]) expect(parseMillions(bad as string)).toBeNull();
  });

  it("shows the multiple of base price", () => {
    expect(multipleOfBase(2000, 1000)).toBe("2.0×");
    expect(multipleOfBase(4500, 1000)).toBe("4.5×");
  });
});

describe("max bid (client 05:39–07:08, reference 03:51 / 05:00)", () => {
  it("is $23M for an empty team with $25M purse and minimum squad 3", () => {
    expect(maxBid({ purse: 25000, spent: 0, squadCount: 0 }, cfg)).toBe(23000);
  });
  it("drops to $22M after buying one candidate for $2M (purse $23M, squad 1)", () => {
    expect(maxBid({ purse: 25000, spent: 2000, squadCount: 1 }, cfg)).toBe(22000);
  });
  it("reserves nothing once the minimum is about to be met", () => {
    expect(reservedForMandatorySlots({ purse: 25000, spent: 5000, squadCount: 2 }, cfg)).toBe(0);
    expect(maxBid({ purse: 25000, spent: 5000, squadCount: 2 }, cfg)).toBe(20000);
    expect(maxBid({ purse: 25000, spent: 5000, squadCount: 5 }, cfg)).toBe(20000);
  });
  it("is zero when the squad is full", () => {
    expect(maxBid({ purse: 25000, spent: 9000, squadCount: 9 }, cfg)).toBe(0);
  });
  it("never goes negative", () => {
    expect(maxBid({ purse: 25000, spent: 24500, squadCount: 0 }, cfg)).toBe(0);
  });
  it("supports a different minimum (logic can be changed — client 06:36)", () => {
    expect(maxBid({ purse: 25000, spent: 0, squadCount: 0 }, { ...cfg, minSquad: 5 })).toBe(21000);
    expect(maxBid({ purse: 25000, spent: 0, squadCount: 0 }, { ...cfg, minSquad: 0 })).toBe(25000);
  });
});

describe("bid amounts", () => {
  it("opens at the base price and then steps by the increment", () => {
    expect(suggestedNextBid(false, null, 1000, cfg)).toBe(1000);
    expect(suggestedNextBid(true, 1000, 1000, cfg)).toBe(2000);
    expect(minimumLegalBid(false, null, 1000)).toBe(1000);
    expect(minimumLegalBid(true, 2000, 1000)).toBe(2001);
  });
  it("offers the reference quick amounts: Base $1M · Next $3M · +50% $4.5M · 2× $6M · 3× $9M · 5× $15M (video 07:57)", () => {
    expect(quickAmounts(true, 2000, 1000, cfg).map((q) => q.amount)).toEqual([1000, 3000, 4500, 6000, 9000, 15000]);
  });
});

describe("checkBid", () => {
  const base: BidContext = {
    auctionStatus: "LIVE",
    lotOpen: true,
    teamExists: true,
    teamName: "Delhi Capitals",
    team: { purse: 25000, spent: 0, squadCount: 0 },
    leadingTeamId: "gt",
    teamId: "dc",
    hasBids: true,
    currentBid: 2000,
    playerBase: 1000,
    amount: 3000,
    cfg,
    formatMoney: (k) => formatMoney(k),
  };
  const code = (over: Partial<BidContext>) => {
    const r = checkBid({ ...base, ...over });
    return r.ok ? "OK" : r.code;
  };

  it("accepts a valid raise", () => expect(code({})).toBe("OK"));
  it("rejects 24 when the team's max is 23, accepts 23 (client 08:11–08:22)", () => {
    expect(code({ amount: 24000 })).toBe("EXCEEDS_MAX_BID");
    expect(code({ amount: 23000 })).toBe("OK");
    const r = checkBid({ ...base, amount: 24000 });
    expect(!r.ok && r.message).toContain("at most $23M");
  });
  it("accepts a custom 10 million on a $2M lot (the reference tool's error must not happen)", () => {
    expect(code({ amount: 10000 })).toBe("OK");
  });
  it("requires more than the current bid", () => {
    expect(code({ amount: 2000 })).toBe("NOT_ABOVE_CURRENT_BID");
    expect(code({ amount: 1500 })).toBe("NOT_ABOVE_CURRENT_BID");
  });
  it("requires at least the base price for the opening bid", () => {
    expect(code({ hasBids: false, currentBid: null, leadingTeamId: null, amount: 500 })).toBe("BELOW_BASE_PRICE");
    expect(code({ hasBids: false, currentBid: null, leadingTeamId: null, amount: 1000 })).toBe("OK");
  });
  it("blocks a team from outbidding itself (double tap)", () => expect(code({ leadingTeamId: "dc" })).toBe("ALREADY_LEADING"));
  it("blocks full squads", () => expect(code({ team: { purse: 25000, spent: 9000, squadCount: 9 } })).toBe("SQUAD_FULL"));
  it("blocks when paused / not live / no candidate / unknown team / bad amount", () => {
    expect(code({ auctionStatus: "PAUSED" })).toBe("AUCTION_PAUSED");
    expect(code({ auctionStatus: "LOCKED" })).toBe("AUCTION_NOT_LIVE");
    expect(code({ lotOpen: false })).toBe("NO_PLAYER_ON_BLOCK");
    expect(code({ teamExists: false })).toBe("TEAM_NOT_FOUND");
    expect(code({ amount: 2.5 })).toBe("INVALID_AMOUNT");
    expect(code({ amount: -1 })).toBe("INVALID_AMOUNT");
  });
});

describe("display order (client 05:06–05:35)", () => {
  const t = (id: string, sortOrder: number, squadCount = 0, spent = 0) => ({ id, sortOrder, squadCount, spent });
  const teams = [t("CSK", 0), t("MI", 1), t("RCB", 2), t("GT", 3), t("DC", 4)];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("keeps the organizer order before any bid (03:51)", () => expect(ids(orderTeamsForDisplay(teams, null))).toEqual(["CSK", "MI", "RCB", "GT", "DC"]));
  it("floats the leading team to the top (04:18)", () => expect(ids(orderTeamsForDisplay(teams, "RCB"))).toEqual(["RCB", "CSK", "MI", "GT", "DC"]));
  it("re-floats on the next bid and returns the previous leader to its place (04:33)", () =>
    expect(ids(orderTeamsForDisplay(teams, "DC"))).toEqual(["DC", "CSK", "MI", "RCB", "GT"]));
  it("ranks teams that already bought candidates next (05:15)", () => {
    const after = [t("CSK", 0), t("MI", 1), t("RCB", 2), t("GT", 3), t("DC", 4, 1, 2000)];
    expect(ids(orderTeamsForDisplay(after, "GT"))).toEqual(["GT", "DC", "CSK", "MI", "RCB"]);
  });
});

describe("end of auction (client 06:53–07:08)", () => {
  it("flags teams below the minimum squad for disqualification", () => {
    expect(isBelowMinimumSquad({ squadCount: 2 }, cfg)).toBe(true);
    expect(isBelowMinimumSquad({ squadCount: 3 }, cfg)).toBe(false);
  });
});

describe("setup checks", () => {
  it("blocks impossible configurations and warns about thin pools", () => {
    expect(setupIssues({ teamCount: 5, playerCount: 20, purse: 25000, cfg }).blocking).toEqual([]);
    expect(setupIssues({ teamCount: 5, playerCount: 20, purse: 25000, cfg }).warnings).toEqual([]);
    expect(setupIssues({ teamCount: 1, playerCount: 0, purse: 25000, cfg }).blocking.length).toBe(2);
    expect(setupIssues({ teamCount: 5, playerCount: 10, purse: 25000, cfg }).warnings[0]).toContain("cannot reach the minimum");
    expect(setupIssues({ teamCount: 5, playerCount: 20, purse: 2000, cfg }).blocking[0]).toContain("purse");
  });
});
