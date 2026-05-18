import { V2ExecutionTargetResolution } from "../resolver/types";

export type SupportedV2Resolution = Extract<V2ExecutionTargetResolution, { supported: true }>;
