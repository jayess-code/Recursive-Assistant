import { StargateRouteBuilder } from "../protocols/stargate";
import { BridgeAssetArgs, BridgeRoute } from "./BridgeTypes";

export class BridgeRouteAggregator {
  static async getRoutes(args: BridgeAssetArgs): Promise<BridgeRoute[]> {
    const routes: BridgeRoute[] = [];

    /* ---------- STARGATE ---------- */
    const stargateRoute = await StargateRouteBuilder.buildRoute(args);
    if (stargateRoute) routes.push(stargateRoute);

    /* ---------- FUTURE PROVIDERS ---------- */
    // const acrossRoute = ...
    // const hopRoute = ...

    return routes;
  }
}
