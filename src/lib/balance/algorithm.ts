/**
 * Team Balancing — pure function (spec §9).
 *
 * Snake-draft seed + hill-climb pair-swap optimization.
 * Deterministik (seed verilirse aynı sonucu üretir), I/O içermez, test edilebilir.
 *
 * Score (lower better):
 *   composite = (1 - w) * skillDiff/(teamSize*500) + w * positionPenalty/teamSize
 *   - skillDiff = |sum(A.skill) - sum(B.skill)|
 *   - positionPenalty = sum |posCount(A,p) - posCount(B,p)| over GK/DEF/MID/FWD
 *   - w (positionWeight) default 0.4
 *
 * Performance budget: 22 oyuncu için < 100ms (spec §9.4).
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type Player = {
  id: string;
  position: Position;
  skillRating: number;
};

export type BalanceConfig = {
  /** Hill-climb iterasyon sayısı. Default 5000. */
  maxIterations?: number;
  /** Pozisyon dengesinin ağırlığı [0..1]. Default 0.4. */
  positionWeight?: number;
  /** Deterministik seed. Verilmezse Date.now() kullanılır (non-deterministic). */
  seed?: number;
  /** Skor değişimi bu eşikten küçükse erken çık. Default 1e-6. */
  epsilon?: number;
};

export type TeamMetrics = {
  skillTotal: number;
  positionCounts: Record<Position, number>;
};

export type BalanceWarning =
  | "no_goalkeeper"
  | "single_goalkeeper"
  | "odd_count";

export type BalanceResult = {
  teamA: Player[];
  teamB: Player[];
  metrics: {
    a: TeamMetrics;
    b: TeamMetrics;
    skillDiff: number;
    positionPenalty: number;
    score: number;
    iterations: number;
    warnings: BalanceWarning[];
  };
};

const POSITIONS: readonly Position[] = ["GK", "DEF", "MID", "FWD"] as const;

/** Mulberry32 — küçük, hızlı, deterministik PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function teamMetrics(team: readonly Player[]): TeamMetrics {
  const positionCounts: Record<Position, number> = {
    GK: 0,
    DEF: 0,
    MID: 0,
    FWD: 0,
  };
  let skillTotal = 0;
  for (const p of team) {
    positionCounts[p.position] += 1;
    skillTotal += p.skillRating;
  }
  return { skillTotal, positionCounts };
}

function positionPenalty(a: TeamMetrics, b: TeamMetrics): number {
  let penalty = 0;
  for (const pos of POSITIONS) {
    penalty += Math.abs(a.positionCounts[pos] - b.positionCounts[pos]);
  }
  return penalty;
}

/**
 * Composite score (lower is better).
 * skillDiff'i teamSize*500 ile normalize ederiz (≈ ortalama oyuncu rating'inin
 * yarısı kadar fark = 1.0 score katkısı). Position penalty teamSize'a böl.
 */
function evaluate(
  a: readonly Player[],
  b: readonly Player[],
  positionWeight: number,
): number {
  const ma = teamMetrics(a);
  const mb = teamMetrics(b);
  const teamSize = Math.max(a.length, 1);
  const skillDiff = Math.abs(ma.skillTotal - mb.skillTotal);
  const skillNorm = skillDiff / (teamSize * 500);
  const posPen = positionPenalty(ma, mb);
  const posNorm = posPen / teamSize;
  return (1 - positionWeight) * skillNorm + positionWeight * posNorm;
}

/**
 * Snake-draft initial split.
 *   sort desc skill → A,B,B,A,A,B,B,A,...
 * Aynı pozisyonu önce serpiştir: pozisyonu olan başlıkta gruplayıp her gruptan
 * snake. Bu hem skill hem pozisyon açısından makul başlangıç verir.
 */
function snakeDraft(players: readonly Player[]): {
  teamA: Player[];
  teamB: Player[];
} {
  // Önce pozisyon önceliği (GK ilk dağıtılsın), sonra skill desc.
  const positionPriority: Record<Position, number> = {
    GK: 0,
    DEF: 1,
    MID: 2,
    FWD: 3,
  };
  const sorted = [...players].sort((x, y) => {
    const pp = positionPriority[x.position] - positionPriority[y.position];
    if (pp !== 0) return pp;
    if (y.skillRating !== x.skillRating) return y.skillRating - x.skillRating;
    return x.id.localeCompare(y.id); // tie-break stable
  });

  const teamA: Player[] = [];
  const teamB: Player[] = [];
  // Snake: 0→A, 1→B, 2→B, 3→A, 4→A, 5→B, 6→B, 7→A...
  for (let i = 0; i < sorted.length; i++) {
    const inGroupOfFour = i % 4;
    const goesToA = inGroupOfFour === 0 || inGroupOfFour === 3;
    if (goesToA) teamA.push(sorted[i]!);
    else teamB.push(sorted[i]!);
  }
  return { teamA, teamB };
}

function detectWarnings(
  a: readonly Player[],
  b: readonly Player[],
  total: number,
): BalanceWarning[] {
  const warnings: BalanceWarning[] = [];
  const allGks = a.concat(b).filter((p) => p.position === "GK").length;
  if (allGks === 0) warnings.push("no_goalkeeper");
  else if (allGks === 1) warnings.push("single_goalkeeper");
  if (total % 2 === 1) warnings.push("odd_count");
  return warnings;
}

/**
 * Ana entry point.
 * @throws Error eğer oyuncu sayısı < 4 ise (anlamlı bir balance yok).
 */
export function balance(
  players: readonly Player[],
  config: BalanceConfig = {},
): BalanceResult {
  if (players.length < 4) {
    throw new Error(
      `balance: en az 4 oyuncu gerekli, ${players.length} verildi.`,
    );
  }

  const positionWeight = config.positionWeight ?? 0.4;
  const maxIterations = config.maxIterations ?? 5000;
  const epsilon = config.epsilon ?? 1e-6;
  const seed = config.seed ?? Date.now();
  const random = mulberry32(seed);

  if (positionWeight < 0 || positionWeight > 1) {
    throw new Error(
      `balance: positionWeight 0..1 arasında olmalı, ${positionWeight}.`,
    );
  }

  const total = players.length;
  const initial = snakeDraft(players);

  // Tek sayıda: A büyük olur (snakeDraft doğal olarak A'ya düşürür); kabul.
  let teamA = initial.teamA;
  let teamB = initial.teamB;
  let bestScore = evaluate(teamA, teamB, positionWeight);
  let iterations = 0;

  // Hill-climb pair-swap
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    if (teamA.length === 0 || teamB.length === 0) break;

    const i = Math.floor(random() * teamA.length);
    const j = Math.floor(random() * teamB.length);

    const candidateA = teamA.slice();
    const candidateB = teamB.slice();
    const tmp = candidateA[i]!;
    candidateA[i] = candidateB[j]!;
    candidateB[j] = tmp;

    const newScore = evaluate(candidateA, candidateB, positionWeight);
    if (newScore < bestScore) {
      const improvement = bestScore - newScore;
      bestScore = newScore;
      teamA = candidateA;
      teamB = candidateB;
      if (improvement < epsilon) break;
    }
  }

  const ma = teamMetrics(teamA);
  const mb = teamMetrics(teamB);
  const skillDiff = Math.abs(ma.skillTotal - mb.skillTotal);
  const posPen = positionPenalty(ma, mb);
  const warnings = detectWarnings(teamA, teamB, total);

  return {
    teamA,
    teamB,
    metrics: {
      a: ma,
      b: mb,
      skillDiff,
      positionPenalty: posPen,
      score: bestScore,
      iterations,
      warnings,
    },
  };
}
