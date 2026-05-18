import { DetectorResult, SwapExecutionPlan, SwapExecutionRequest, SwapQuote } from "../SwapTypes";

export interface SwapFamilyAdapter {
  readonly family: DetectorResult["family"];
  detectSupport(detectorResult: DetectorResult): boolean;
  getQuote(request: SwapExecutionRequest, detectorResult: DetectorResult): Promise<SwapQuote>;
  buildSwapTransaction(
    request: SwapExecutionRequest,
    quote: SwapQuote,
    detectorResult: DetectorResult
  ): Promise<SwapExecutionPlan["artifacts"]>;
}
