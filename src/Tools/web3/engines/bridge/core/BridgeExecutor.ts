import { BridgeRouter } from "./BridgeRouter";
import { BridgeAssetArgs } from "./BridgeTypes";

export class BridgeExecutor {
  static async executeBest(args: BridgeAssetArgs) {
    const { routes, best } = await BridgeRouter.route(args);

    if (!best) {
      throw new Error("No valid bridge routes found");
    }

    try {
      return {
        route: best.provider,
        result: best.executionPlan,
      };
    } catch {
      for (const route of routes) {
        if (route === best) continue;

        try {
          return {
            route: route.provider,
            result: route.executionPlan,
          };
        } catch {
          continue;
        }
      }

      throw new Error("All bridge routes failed");
    }
  }
}
