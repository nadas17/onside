import { describe, expect, it } from "vitest";
import {
  applyEloForMatch,
  applyMvpBonus,
  deriveSkillLevel,
  expectedScore,
  ELO_K,
  MVP_BONUS,
  type EloPlayer,
} from "@/lib/elo";

const makeTeam = (
  team: "A" | "B",
  ratings: number[],
  prefix = "p",
): EloPlayer[] =>
  ratings.map((r, i) => ({
    id: `${team}-${prefix}-${i}`,
    ratingBefore: r,
    team,
  }));

describe("expectedScore", () => {
  it("eşit ortalama → 0.5", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 6);
  });

  it("favori +400 rating → ~0.909", () => {
    // standard Elo: 400 fark = 10:1 odds → 0.909
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 4);
  });

  it("alt taraf -400 rating → ~0.091", () => {
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11, 4);
  });

  it("expA + expB = 1 (her zaman)", () => {
    const a = expectedScore(1100, 950);
    const b = expectedScore(950, 1100);
    expect(a + b).toBeCloseTo(1, 6);
  });
});

describe("deriveSkillLevel", () => {
  it.each([
    [799, "beginner"],
    [800, "intermediate"],
    [1099, "intermediate"],
    [1100, "advanced"],
    [1299, "advanced"],
    [1300, "pro"],
    [9999, "pro"],
    [0, "beginner"],
  ] as const)("rating %d → %s", (rating, expected) => {
    expect(deriveSkillLevel(rating)).toBe(expected);
  });
});

describe("applyEloForMatch", () => {
  it("eşit takımlar, A 3-1 kazanır → A pozitif delta, B negatif, |deltaA|=|deltaB|", () => {
    const players = [
      ...makeTeam("A", [1000, 1000, 1000]),
      ...makeTeam("B", [1000, 1000, 1000]),
    ];
    const result = applyEloForMatch(players, 3, 1);
    expect(result.outcome).toBe("A");
    expect(result.deltaA).toBeGreaterThan(0);
    expect(result.deltaB).toBeLessThan(0);
    expect(Math.abs(result.deltaA)).toBe(Math.abs(result.deltaB));
    // K=32, expected=0.5, actual=1 → delta = round(32 * 0.5) = 16
    expect(result.deltaA).toBe(16);
    expect(result.deltaB).toBe(-16);
  });

  it("favori takım kazanırsa az puan alır (low expected gain when expected to win)", () => {
    const players = [
      ...makeTeam("A", [1300, 1300, 1300]),
      ...makeTeam("B", [900, 900, 900]),
    ];
    const result = applyEloForMatch(players, 5, 0);
    // expA ≈ 0.909, actual=1, delta = round(32 * 0.091) ≈ 3
    expect(result.deltaA).toBe(3);
    expect(result.deltaB).toBe(-3);
  });

  it("alt taraf kazanırsa çok puan alır (upset)", () => {
    const players = [
      ...makeTeam("A", [900, 900, 900]),
      ...makeTeam("B", [1300, 1300, 1300]),
    ];
    const result = applyEloForMatch(players, 3, 1);
    // expA ≈ 0.091, actual=1, delta = round(32 * 0.909) ≈ 29
    expect(result.deltaA).toBe(29);
    expect(result.deltaB).toBe(-29);
  });

  it("beraberlik eşit takımlarda → delta=0", () => {
    const players = [
      ...makeTeam("A", [1000, 1000]),
      ...makeTeam("B", [1000, 1000]),
    ];
    const result = applyEloForMatch(players, 2, 2);
    expect(result.outcome).toBe("draw");
    expect(result.deltaA).toBe(0);
    expect(result.deltaB).toBe(0);
  });

  it("beraberlik dengesiz takımlarda → favori takım puan kaybeder", () => {
    const players = [
      ...makeTeam("A", [1300, 1300]),
      ...makeTeam("B", [900, 900]),
    ];
    const result = applyEloForMatch(players, 2, 2);
    // expA ≈ 0.909, actual=0.5, delta = round(32 * -0.409) ≈ -13
    expect(result.outcome).toBe("draw");
    expect(result.deltaA).toBeLessThan(0);
    expect(result.deltaB).toBeGreaterThan(0);
    expect(Math.abs(result.deltaA)).toBe(Math.abs(result.deltaB));
  });

  it("perPlayer takımdaki tüm oyuncular için aynı delta", () => {
    const players = [
      ...makeTeam("A", [800, 1200, 1500]),
      ...makeTeam("B", [1000, 1100, 1100]),
    ];
    const result = applyEloForMatch(players, 4, 2);
    const aDeltas = result.perPlayer
      .filter((p) => p.team === "A")
      .map((p) => p.delta);
    const bDeltas = result.perPlayer
      .filter((p) => p.team === "B")
      .map((p) => p.delta);
    expect(new Set(aDeltas).size).toBe(1);
    expect(new Set(bDeltas).size).toBe(1);
    expect(aDeltas[0]).toBe(result.deltaA);
    expect(bDeltas[0]).toBe(result.deltaB);
  });

  it("perPlayer.ratingAfter = ratingBefore + delta", () => {
    const players = [
      ...makeTeam("A", [950, 1050]),
      ...makeTeam("B", [1100, 900]),
    ];
    const result = applyEloForMatch(players, 1, 0);
    for (const p of result.perPlayer) {
      expect(p.ratingAfter).toBe(p.ratingBefore + p.delta);
    }
  });

  it("boş takım → throw", () => {
    expect(() => applyEloForMatch(makeTeam("A", [1000, 1000]), 1, 0)).toThrow(
      /her iki takım/i,
    );
  });

  it("negatif skor → throw", () => {
    const players = [...makeTeam("A", [1000]), ...makeTeam("B", [1000])];
    expect(() => applyEloForMatch(players, -1, 0)).toThrow(/negatif/);
  });

  it("custom K parametresi delta'yı orantılı değiştirir", () => {
    const players = [
      ...makeTeam("A", [1000, 1000]),
      ...makeTeam("B", [1000, 1000]),
    ];
    const r32 = applyEloForMatch(players, 1, 0, 32);
    const r16 = applyEloForMatch(players, 1, 0, 16);
    expect(r32.deltaA).toBe(16);
    expect(r16.deltaA).toBe(8);
  });
});

describe("applyMvpBonus", () => {
  it("default flat +10", () => {
    const r = applyMvpBonus(1000);
    expect(r.delta).toBe(MVP_BONUS);
    expect(r.ratingAfter).toBe(1010);
  });

  it("custom bonus", () => {
    const r = applyMvpBonus(1500, 25);
    expect(r.ratingAfter).toBe(1525);
    expect(r.delta).toBe(25);
  });
});

describe("ELO_K constant", () => {
  it("spec §10 K=32", () => {
    expect(ELO_K).toBe(32);
  });
});
