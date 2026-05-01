/**
 * Elo rating — pure function (spec §10).
 *
 * Klasik Elo with K=32. Beraberlik için score = 0.5.
 *
 *   expected = 1 / (1 + 10^((opponentAvg - teamAvg) / 400))
 *   delta    = round(K * (actualScore - expected))
 *
 * MVP bonus flat +10 (match Elo'sundan ayrı; ayrı snapshot).
 *
 * Oyuncu bazında: takımı kazandıysa actual=1, kaybettiyse 0, beraberlik 0.5.
 * Delta tüm takım için aynı (ortalama-bazlı, individual contribution değil).
 *
 * `skill_level` rating'den derive (eşik tablosu Spec §10.5):
 *   < 800       → beginner
 *   800 .. 1099 → intermediate
 *   1100 .. 1299 → advanced
 *   ≥ 1300      → pro
 */

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "pro";

export const ELO_K = 32;
export const MVP_BONUS = 10;

export type EloPlayer = {
  id: string;
  ratingBefore: number;
  team: "A" | "B";
};

export type EloResult = {
  scoreA: number;
  scoreB: number;
  outcome: "A" | "B" | "draw";
  expectedA: number;
  expectedB: number;
  deltaA: number;
  deltaB: number;
  perPlayer: Array<{
    id: string;
    team: "A" | "B";
    ratingBefore: number;
    ratingAfter: number;
    delta: number;
  }>;
};

/** Skill level eşikleri (spec §10.5). */
export function deriveSkillLevel(rating: number): SkillLevel {
  if (rating < 800) return "beginner";
  if (rating < 1100) return "intermediate";
  if (rating < 1300) return "advanced";
  return "pro";
}

function avg(ratings: number[]): number {
  if (ratings.length === 0) return 1000;
  let sum = 0;
  for (const r of ratings) sum += r;
  return sum / ratings.length;
}

/** Klasik expected score formula. */
export function expectedScore(teamAvg: number, opponentAvg: number): number {
  return 1 / (1 + Math.pow(10, (opponentAvg - teamAvg) / 400));
}

/**
 * Maç sonucundan tüm oyuncuların Elo delta'larını hesaplar.
 *
 * - Sadece `attended=true` oyuncular dahil (kullanıcı filter'ı caller'da yapar).
 * - `players` listesi A ve B'yi karışık içerebilir; team alanına göre ayrılır.
 * - Beraberlikte (scoreA===scoreB) iki takım da expected'a göre +/- alır.
 *
 * @throws Error eğer A veya B'de oyuncu yoksa.
 */
export function applyEloForMatch(
  players: readonly EloPlayer[],
  scoreA: number,
  scoreB: number,
  k: number = ELO_K,
): EloResult {
  if (scoreA < 0 || scoreB < 0) {
    throw new Error(
      `applyEloForMatch: skor negatif olamaz (${scoreA}-${scoreB}).`,
    );
  }
  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");
  if (teamA.length === 0 || teamB.length === 0) {
    throw new Error("applyEloForMatch: her iki takımda en az 1 oyuncu olmalı.");
  }

  const avgA = avg(teamA.map((p) => p.ratingBefore));
  const avgB = avg(teamB.map((p) => p.ratingBefore));
  const expA = expectedScore(avgA, avgB);
  const expB = 1 - expA;

  let actualA: number;
  let actualB: number;
  let outcome: "A" | "B" | "draw";
  if (scoreA > scoreB) {
    actualA = 1;
    actualB = 0;
    outcome = "A";
  } else if (scoreB > scoreA) {
    actualA = 0;
    actualB = 1;
    outcome = "B";
  } else {
    actualA = 0.5;
    actualB = 0.5;
    outcome = "draw";
  }

  const deltaA = Math.round(k * (actualA - expA));
  const deltaB = Math.round(k * (actualB - expB));

  const perPlayer = players.map((p) => {
    const delta = p.team === "A" ? deltaA : deltaB;
    return {
      id: p.id,
      team: p.team,
      ratingBefore: p.ratingBefore,
      ratingAfter: p.ratingBefore + delta,
      delta,
    };
  });

  return {
    scoreA,
    scoreB,
    outcome,
    expectedA: expA,
    expectedB: expB,
    deltaA,
    deltaB,
    perPlayer,
  };
}

/** MVP bonus flat (spec §10.4). */
export function applyMvpBonus(
  ratingBefore: number,
  bonus: number = MVP_BONUS,
): { ratingBefore: number; ratingAfter: number; delta: number } {
  return {
    ratingBefore,
    ratingAfter: ratingBefore + bonus,
    delta: bonus,
  };
}
