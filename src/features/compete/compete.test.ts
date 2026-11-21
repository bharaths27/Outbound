import { describe, expect, it } from "vitest";
import type { LeaderboardRow, SquadWithMembers } from "@/lib/data/types";
import { initials, inviteUrl, isCrossSchool, normalizeCode, rankSchools, squadName } from "./compete";

const row = (school_id: number, eligible: boolean, weekly_xp: number): LeaderboardRow => ({
  school_id,
  name: `School ${school_id}`,
  color: null,
  weekly_xp,
  players: eligible ? 6 : 3,
  eligible,
});

describe("rankSchools", () => {
  const rows = [row(1, true, 900), row(2, true, 500), row(3, false, 800), row(4, false, 100)];

  it("ranks eligible schools only and finds mine", () => {
    const { rows: ranked, mine } = rankSchools(rows, 3);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, null, null]);
    expect(mine).toMatchObject({ school_id: 3, rank: null, mine: true });
  });

  it("works signed out", () => {
    expect(rankSchools(rows, null).mine).toBeNull();
  });
});

describe("squads", () => {
  const member = (school_id: number) => ({
    squad_id: "s",
    user_id: `u${school_id}`,
    display_name: null,
    avatar_url: null,
    school_id,
    school_name: "",
    school_color: null,
    joined_at: "",
  });
  const squad = (schools: number[], name: string | null = "Owls"): SquadWithMembers => ({
    id: "s",
    code: "AB12CD",
    name,
    created_by: "u1",
    created_at: "",
    members: schools.map(member),
  });

  it("spots cross-school squads", () => {
    expect(isCrossSchool(squad([1, 2]))).toBe(true);
    expect(isCrossSchool(squad([1, 1]))).toBe(false);
  });

  it("cleans up codes, including pasted invite links", () => {
    expect(normalizeCode(" ab12cd ")).toBe("AB12CD");
    expect(normalizeCode("ab-12 cd-99")).toBe("AB12CD");
    expect(normalizeCode("https://outbound.app/squad/join/ab12cd")).toBe("AB12CD");
  });

  it("formats names, links, and initials", () => {
    expect(inviteUrl("https://outbound.app/", "AB12CD")).toBe("https://outbound.app/squad/join/AB12CD");
    expect(squadName(squad([1], null))).toBe("Squad AB12CD");
    expect(squadName(squad([1], "  "))).toBe("Squad AB12CD");
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("maya")).toBe("M");
    expect(initials("Ana Lucia de Souza")).toBe("AS");
    expect(initials(null)).toBe("?");
  });
});
