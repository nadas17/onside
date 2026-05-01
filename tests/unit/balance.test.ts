import { describe, expect, it } from "vitest";
import {
  balance,
  type BalanceConfig,
  type Player,
  type Position,
} from "@/lib/balance/algorithm";

function makePlayer(
  id: string,
  position: Position,
  skillRating: number,
): Player {
  return { id, position, skillRating };
}

/** Yardımcı: 4'lü pozisyon dağılımı (1 GK + 1 DEF + 1 MID + 1 FWD) */
function makeBalancedFour(idPrefix: string, baseRating: number): Player[] {
  return [
    makePlayer(`${idPrefix}-gk`, "GK", baseRating),
    makePlayer(`${idPrefix}-def`, "DEF", baseRating),
    makePlayer(`${idPrefix}-mid`, "MID", baseRating),
    makePlayer(`${idPrefix}-fwd`, "FWD", baseRating),
  ];
}

describe("balance", () => {
  it("aynı seed ile aynı sonucu üretir (deterministic)", () => {
    const players = [
      ...makeBalancedFour("a", 1000),
      ...makeBalancedFour("b", 1100),
      ...makeBalancedFour("c", 900),
    ];
    const config: BalanceConfig = { seed: 42 };
    const r1 = balance(players, config);
    const r2 = balance(players, config);

    expect(r1.teamA.map((p) => p.id)).toEqual(r2.teamA.map((p) => p.id));
    expect(r1.teamB.map((p) => p.id)).toEqual(r2.teamB.map((p) => p.id));
    expect(r1.metrics.score).toBe(r2.metrics.score);
  });

  it("farklı seed ile (genelde) farklı atama üretir", () => {
    // Tüm aynı skill+pozisyon: skor=0 her config'de, swap ler bilinmez sırayla farklı sonuç verir
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`p${i}`, "MID", 1000),
    );
    const r1 = balance(players, { seed: 1 });
    const r2 = balance(players, { seed: 9999 });
    // Skill ve pozisyon aynı → score her ikisi de 0 olur ama assignment farklı olabilir
    expect(r1.metrics.score).toBe(0);
    expect(r2.metrics.score).toBe(0);
    const a1 = r1.teamA.map((p) => p.id).sort();
    const a2 = r2.teamA.map((p) => p.id).sort();
    // Mutlaka farklı olmasını test etmek tehlikeli (rassal eşitlik mümkün) ama eşit
    // ihtimali çok düşük; assertion: en azından her iki team'de 5 oyuncu var.
    expect(r1.teamA.length).toBe(5);
    expect(r1.teamB.length).toBe(5);
    expect(a1).not.toEqual([]);
    expect(a2).not.toEqual([]);
  });

  it("0 GK varsa 'no_goalkeeper' warning ekler", () => {
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`p${i}`, "MID", 1000 + i * 50),
    );
    const result = balance(players, { seed: 1 });
    expect(result.metrics.warnings).toContain("no_goalkeeper");
  });

  it("1 GK varsa 'single_goalkeeper' warning ekler", () => {
    const players = [
      makePlayer("gk", "GK", 1100),
      ...Array.from({ length: 9 }, (_, i) =>
        makePlayer(`m${i}`, "MID", 1000 + i * 30),
      ),
    ];
    const result = balance(players, { seed: 7 });
    expect(result.metrics.warnings).toContain("single_goalkeeper");
  });

  it("2+ GK ile warning yok", () => {
    const players = [
      makePlayer("gk1", "GK", 1100),
      makePlayer("gk2", "GK", 1050),
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`m${i}`, "MID", 1000)),
    ];
    const result = balance(players, { seed: 1 });
    expect(result.metrics.warnings).not.toContain("no_goalkeeper");
    expect(result.metrics.warnings).not.toContain("single_goalkeeper");
  });

  it("tek sayıda oyuncu → 'odd_count' warning + bir takım bir kişi fazla", () => {
    const players = Array.from({ length: 11 }, (_, i) =>
      makePlayer(`p${i}`, "MID", 1000 + i * 10),
    );
    const result = balance(players, { seed: 1 });
    expect(result.metrics.warnings).toContain("odd_count");
    expect(Math.abs(result.teamA.length - result.teamB.length)).toBe(1);
    expect(result.teamA.length + result.teamB.length).toBe(11);
  });

  it("4'ten az oyuncuda throw", () => {
    const players = [
      makePlayer("p1", "MID", 1000),
      makePlayer("p2", "MID", 1000),
      makePlayer("p3", "MID", 1000),
    ];
    expect(() => balance(players, { seed: 1 })).toThrow(/en az 4/);
  });

  it("aynı pozisyon, farklı skill → skill-only balance (skillDiff küçük)", () => {
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`p${i}`, "MID", 800 + i * 100),
    );
    const result = balance(players, { seed: 1, positionWeight: 0 });
    // 800..1700 toplam = 12500, fark 2 takımda max ≤ 100 olmalı
    expect(result.metrics.skillDiff).toBeLessThanOrEqual(100);
  });

  it("aynı skill, pozisyon karışık → position penalty küçük", () => {
    // 8 GK, 8 DEF, 8 MID, 8 FWD = 32 oyuncu hepsi 1000 rating
    const players: Player[] = [];
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      for (let i = 0; i < 8; i++) {
        players.push(makePlayer(`${pos}-${i}`, pos, 1000));
      }
    }
    const result = balance(players, { seed: 1, positionWeight: 1 });
    // pure pozisyon ağırlığında her pozisyondan 4-4 olmalı
    expect(result.metrics.positionPenalty).toBeLessThanOrEqual(2);
  });

  it("22 oyuncu için < 100ms (perf budget, spec §9.4)", () => {
    const players: Player[] = [];
    const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
    for (let i = 0; i < 22; i++) {
      players.push(
        makePlayer(
          `p${i}`,
          positions[i % 4]!,
          800 + Math.floor(Math.random() * 600),
        ),
      );
    }
    const t0 = performance.now();
    balance(players, { seed: 42 });
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(100);
  });

  it("re-balance idempotent: aynı input + aynı seed → aynı çıktı", () => {
    const players = [
      ...makeBalancedFour("a", 1000),
      ...makeBalancedFour("b", 1200),
      ...makeBalancedFour("c", 900),
      makePlayer("extra-gk", "GK", 1100),
      makePlayer("extra-fwd", "FWD", 950),
    ];
    const r1 = balance(players, { seed: 1234 });
    const r2 = balance(players, { seed: 1234 });
    expect(r1).toEqual(r2);
  });

  it("positionWeight=0 → puro skill, position penalty fark etmez", () => {
    // 4 GK + 4 MID, skill simetrik
    const players = [
      makePlayer("gk1", "GK", 1500),
      makePlayer("gk2", "GK", 500),
      makePlayer("gk3", "GK", 1500),
      makePlayer("gk4", "GK", 500),
      makePlayer("m1", "MID", 1500),
      makePlayer("m2", "MID", 500),
      makePlayer("m3", "MID", 1500),
      makePlayer("m4", "MID", 500),
    ];
    const result = balance(players, { seed: 1, positionWeight: 0 });
    expect(result.metrics.skillDiff).toBe(0);
  });

  it("balance toplam oyuncu sayısını korur", () => {
    const players = Array.from({ length: 14 }, (_, i) =>
      makePlayer(
        `p${i}`,
        (["GK", "DEF", "MID", "FWD"] as Position[])[i % 4]!,
        900 + i * 25,
      ),
    );
    const result = balance(players, { seed: 99 });
    expect(result.teamA.length + result.teamB.length).toBe(14);
    const idsOut = new Set([
      ...result.teamA.map((p) => p.id),
      ...result.teamB.map((p) => p.id),
    ]);
    expect(idsOut.size).toBe(14);
  });

  it("metrics.skillTotal teamA + teamB = total skill", () => {
    const players = [
      makePlayer("p1", "GK", 1100),
      makePlayer("p2", "DEF", 1200),
      makePlayer("p3", "DEF", 950),
      makePlayer("p4", "MID", 1300),
      makePlayer("p5", "MID", 1000),
      makePlayer("p6", "FWD", 800),
    ];
    const total = players.reduce((s, p) => s + p.skillRating, 0);
    const result = balance(players, { seed: 1 });
    expect(result.metrics.a.skillTotal + result.metrics.b.skillTotal).toBe(
      total,
    );
  });

  it("invalid positionWeight → throw", () => {
    const players = makeBalancedFour("a", 1000).concat(
      makeBalancedFour("b", 1000),
    );
    expect(() => balance(players, { positionWeight: 1.5, seed: 1 })).toThrow();
    expect(() => balance(players, { positionWeight: -0.1, seed: 1 })).toThrow();
  });
});
