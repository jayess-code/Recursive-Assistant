# Tool Response Contract

All tools in this repository return a **unified JSON response structure**, never throw exceptions. This enables the LLM assistant to see errors directly and reason about recovery strategies without interrupting execution.

---

## Response Schema

Every tool returns `JSON.stringify()` of this structure:

```typescript
interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;        // Present when success === true
  error?: string;  // Present when success === false
}
```

---

## Examples

### Success Response

```typescript
// Input: fetchTokenPairs({ tokenAddress: "0x...", chain: "ethereum" })
// Output (JSON stringified):
{
  "success": true,
  "data": [
    {
      "chain": "ethereum",
      "pairAddress": "0x...",
      "dexId": "uniswap",
      "tokenA": "0x...",
      "priceUsd": 1234.56,
      "liquidityUsd": 5000000
    }
  ]
}
```

### Error Response

```typescript
// Input: fetchTokenPairs({ tokenAddress: null, chain: "ethereum" })
// Output (JSON stringified):
{
  "success": false,
  "error": "tokenAddress is required. Provide a valid ERC-20 contract address on the specified chain."
}
```

### Recoverable Error (LLM Can Retry)

```typescript
// Input: searchToken({ value: "USDC", chain: "unknown-chain" })
// Output (JSON stringified):
{
  "success": false,
  "error": "Chain 'unknown-chain' is not recognized. Supported chains: ethereum, polygon, base, arbitrum, optimism, avalanche. Please retry with a valid chain key."
}
```

---

## Why This Pattern?

1. **LLM Self-Correction**: The assistant sees errors as data, not exceptions. It can analyze them and adjust parameters or retry with different inputs **within the same reasoning loop**.

2. **No Execution Halt**: Tool failures don't throw; they surface as structured responses. The reasoning engine continues and can handle multiple failed attempts.

3. **Transparent Debugging**: Error messages are shaped for LLM interpretation, guiding it toward recovery (e.g., listing valid options, explaining what went wrong).

4. **Reduced Boilerplate**: No defensive validation clutter, no repeated try-catch blocks across tools. Just business logic → result wrapper.

---

## Guidelines for Tool Authors

### When to Return Success

```typescript
// Tool successfully completed its task
{
  success: true,
  data: result
}
```

### When to Return Error

Return an error response for **any failure** — validation failures, network errors, not found, permission denied, etc. — instead of throwing:

```typescript
// Validation failure
if (!args.tokenAddress) {
  return JSON.stringify({
    success: false,
    error: "tokenAddress is required. Provide a valid ERC-20 contract address on the specified chain."
  });
}

// API failure
try {
  const result = await fetchFromAPI(...);
  return JSON.stringify({ success: true, data: result });
} catch (err) {
  return JSON.stringify({
    success: false,
    error: `Failed to fetch data: ${err instanceof Error ? err.message : String(err)}`
  });
}
```

### Error Message Best Practices

Write error messages for LLM interpretation. Include:

- **What went wrong**: Clear, specific reason
- **Why it happened**: Context or constraint violated
- **How to fix it**: Guidance or valid options to retry with

**Good:**
```
"Chain 'solana' is not supported. Supported chains: ethereum, polygon, base, arbitrum, optimism, avalanche. Retry with one of these chain keys."
```

**Avoid:**
```
"Invalid chain" or "Error" or technical stack traces
```

---

## Migration Guide for Existing Tools

### Before (Throws Exceptions)

```typescript
export async function fetchTokenPairs(args: FetchTokenPairsArgs) {
  if (!args.tokenAddress) {
    throw new Error("tokenAddress is required.");
  }
  
  try {
    const pairs = await api.fetch(...);
    return normalizeForToolOutput(pairs);
  } catch (error) {
    throw new Error(`API failure: ${error.message}`);
  }
}
```

### After (Returns ToolResponse)

```typescript
export async function fetchTokenPairs(args: FetchTokenPairsArgs): Promise<string> {
  if (!args.tokenAddress) {
    return JSON.stringify({
      success: false,
      error: "tokenAddress is required. Provide a valid ERC-20 contract address."
    });
  }
  
  try {
    const pairs = await api.fetch(...);
    return JSON.stringify({
      success: true,
      data: pairs
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to fetch token pairs: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}
```

### Removal of Boilerplate

- ❌ Remove `normalizeForToolOutput()` calls — bigints and objects serialize naturally in JSON
- ❌ Remove defensive `try-catch` at executor level — tools handle their own errors
- ❌ Remove intermediate validation throws — return error responses instead
- ❌ Remove chain normalization guards scattered across tools — handle in tool logic, return error if invalid

---

## Handler Contract in `*Tool.ts`

Handlers wrap the implementation and **always return `JSON.stringify(ToolResponse)`**:

```typescript
import { fetchTokenPairs, FetchTokenPairsArgs } from "./fetchTokenPairs";

export const fetchTokenPairsTool = {
  schema: {
    type: "object",
    properties: {
      tokenAddress: { type: "string" },
      chain: { type: "string" }
    },
    required: ["tokenAddress", "chain"],
    additionalProperties: false
  },
  handler: async (args: FetchTokenPairsArgs) => {
    return fetchTokenPairs(args);  // Implementation returns JSON.stringify(ToolResponse)
  },
  info: {
    name: "fetch_token_pairs",
    description: "Fetch token pair/pool market entries..."
  }
};
```

---

## ToolResponse Utility (Optional)

For convenience, import from `Tools/types/toolResponse.ts`:

```typescript
import { ToolResponse, toToolResponse } from "../../types/toolResponse";

// Manual wrapping (explicit control over error messages)
export async function fetchTokenPairs(args: FetchTokenPairsArgs): Promise<string> {
  if (!args.tokenAddress) {
    return JSON.stringify({
      success: false,
      error: "tokenAddress is required."
    });
  }
  // ...
}

// Or use helper (automatically catches all errors)
export async function fetchTokenPairs(args: FetchTokenPairsArgs): Promise<string> {
  return toToolResponse(async () => {
    const pairs = await api.fetch(args.tokenAddress);
    return pairs;
  });
}
```

---

## Executor Expectations

The `ToolExecutor` expects all tools to return **JSON strings**. No exceptions. It:
1. Receives the JSON string response from the tool
2. Parses it to verify `{ success: boolean, data?, error? }`
3. Passes the structured response to the LLM context
4. LLM reads `error` field and reasons about recovery

---

## FAQ

**Q: What if I want to log errors in addition to returning them?**
A: Yes, log to console for debugging. But also include the error in the response so the assistant sees it.

```typescript
catch (error) {
  console.error("API call failed:", error);
  return JSON.stringify({
    success: false,
    error: `API call failed: ${error.message}`
  });
}
```

**Q: Should rate limits include a retry delay in the response?**
A: For now, include it in the error message. The LLM can read "Retry after 60 seconds" and decide when to retry.

```typescript
error: "Rate limited. Retry after 60 seconds."
```

**Q: What about null vs undefined in the data field?**
A: Avoid both. Return `success: false` for "no data found" scenarios, not `{ success: true, data: null }`.

```typescript
// Bad
{ success: true, data: null }

// Good
{ success: false, error: "No token pairs found for the given address and chain." }
```

**Q: Can data be null for valid responses?**
A: No. If there's valid data, include it. If there's no data, it's an error state.

---

## Bridge Tool Response Notes

Bridge tools currently return structured objects using a status model optimized for route reasoning:

```typescript
interface BridgeToolResponse {
  status: "supported" | "unsupported" | "error";
  reason?: string;
  details?: string;
  // plus tool-specific fields (plan, txHash, summary, etc.)
}
```

Bridge status semantics:

- `supported`: route/path is valid for the requested operation.
- `unsupported`: token/chain/path is not available for transfer under current constraints.
- `error`: transient or execution/config failure (RPC/provider/network/internal failures).

Bridge discovery expectations:

- `bridge_discovery` uses LayerZero `GET /v1/tokens` with `transferrableFromChainKey` and `transferrableFromTokenAddress`.
- LayerZero `422 Unsupported token` responses should be surfaced as structured tool errors and treated as non-bridgeable input for that request.
- Discovery success does not guarantee quote/execute success; quote-time validation can still fail.
