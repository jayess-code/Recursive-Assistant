import { BridgeRouteAggregator } from "./BridgeRouteAggregator";
import { BridgeRouteScorer } from "./BridgeRouteScorer";
import { BridgeAssetArgs, BridgeRoute } from "./BridgeTypes";

export interface BridgeRoutingResult {
  routes: BridgeRoute[];
  best: BridgeRoute | null;
}

export class BridgeRouter {
  static async route(args: BridgeAssetArgs): Promise<BridgeRoutingResult> {
    const routes = await BridgeRouteAggregator.getRoutes(args);
    const best = BridgeRouteScorer.pickBest(routes);

    return {
      routes,
      best,
    };
  }
}
