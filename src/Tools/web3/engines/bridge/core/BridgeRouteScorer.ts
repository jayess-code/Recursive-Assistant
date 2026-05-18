import { BridgeRoute } from "./BridgeTypes";

export class BridgeRouteScorer {
  static score(route: BridgeRoute): number {
    let score = 100;

    /* ---------- FEES ---------- */
    const feePenalty = Number(route.fee.native) / 1e15;
    score -= feePenalty;

    /* ---------- SPEED ---------- */
    if (route.timeEstimate === "slow") score -= 10;
    if (route.timeEstimate === "medium") score -= 5;

    /* ---------- RISK ---------- */
    if (route.riskLevel === "medium") score -= 10;
    if (route.riskLevel === "high") score -= 25;

    return score;
  }

  static pickBest(routes: BridgeRoute[]): BridgeRoute | null {
    if (!routes.length) return null;

    const best = routes
      .map((r) => ({ route: r, score: this.score(r) }))
      .sort((a, b) => b.score - a.score)[0];

    return best?.route ?? null;
  }
}
