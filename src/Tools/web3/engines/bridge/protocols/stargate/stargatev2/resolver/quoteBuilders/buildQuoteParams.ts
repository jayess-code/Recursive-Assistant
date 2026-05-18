import { buildAsset0QuoteParams } from "../../asset0/buildAsset0QuoteParams";
import { buildOftAdapterQuoteParams } from "../../oft-adapter/buildOftAdapterQuoteParams";
import { buildOftQuoteParams } from "../../oft/buildOftQuoteParams";
import { V2QuoteSendParams, OFTQuoteSendParams, AdapterQuoteSendParams } from "../types";

type QuoteParamSurface = "oft" | "adapter" | "asset0";
type QuoteParamArgsBySurface = {
  oft: Parameters<typeof buildOftQuoteParams>[0];
  adapter: Parameters<typeof buildOftAdapterQuoteParams>[0];
  asset0: Parameters<typeof buildAsset0QuoteParams>[0];
};

type ReturnParamBySurface = {
  oft: OFTQuoteSendParams;
  adapter: AdapterQuoteSendParams;
  asset0: OFTQuoteSendParams; // Asset0 uses OFT encoding for composeMsg
};

export function buildQuoteParams<S extends QuoteParamSurface>(
  surface: S,
  args: QuoteParamArgsBySurface[S]
): ReturnParamBySurface[S];
export function buildQuoteParams(
  surface: QuoteParamSurface,
  args: QuoteParamArgsBySurface[QuoteParamSurface]
): V2QuoteSendParams | AdapterQuoteSendParams {
  switch (surface) {
    case "oft":
      return buildOftQuoteParams(args as QuoteParamArgsBySurface["oft"]);

    case "adapter":
      return buildOftAdapterQuoteParams(args as QuoteParamArgsBySurface["adapter"]);

    case "asset0":
      return buildAsset0QuoteParams(args as QuoteParamArgsBySurface["asset0"]);
  }

  throw new Error(`Unsupported Stargate V2 execution surface: ${surface}`);
}