# AI Reasoning

A TypeScript agent framework with a reasoning loop, multi-provider LLM support, and tool execution.

## What This Project Does


## Tool Response Pattern

All tools in this repository follow a **unified JSON response contract**: they return structured responses instead of throwing exceptions. This enables the LLM assistant to see errors directly and reason about recovery strategies without interrupting execution.

Every tool returns `JSON.stringify({ success: boolean, data?: T, error?: string })`. See `Tools/web3/TOOL_RESPONSE_CONTRACT.md` for the full specification, examples, and migration guide for existing tools.

## Requirements


## Install

```bash
npm install
```

## Environment Variables

Core runtime variables:

- AI_PROVIDER: Provider name used by the CLI (default: openai)
- AI_MODEL: Model id used by the CLI (default: gpt-4o-mini)

Provider API keys:

- OPENAI_API_KEY: Required for OpenAI provider
- DEEPSEEK_API_KEY: Required for DeepSeek provider
- ANTHROPIC_API_KEY: Required for Anthropic provider

Common Ollama variables:

- OLLAMA_HOST: Ollama host URL (default: http://localhost:11434)
- OLLAMA_DEFAULT_MODEL: Default Ollama model (default: llama3.1)
- OLLAMA_TIMEOUT_MS: Request timeout in ms (default: 120000)
- OLLAMA_MAX_MESSAGES: Max recent messages included for Ollama calls (default: 20)
- OLLAMA_MAX_TOKENS: Max output tokens for Ollama path (default: 200)

Example .env:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_openai_key
```

## Scripts

- npm run start: Starts interactive CLI chat from main.ts
- npm run dev: Runs single-turn example from example.ts
- npm run typecheck: TypeScript check without emitting output
- npm run build: Compiles TypeScript

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Set environment variables in .env.

3. Start CLI chat:

```bash
npm run start
```

4. Ask multiple questions in one session. The app keeps message history in memory for context continuity.

5. Exit with:

- quit
- exit
- Ctrl+C

## How Conversation State Works

The CLI keeps an InternalMessage array in memory:

1. User input is appended as a user message.
2. Agent.run is called with current history.
3. The returned full message array replaces local history.
4. This allows dynamic multi-turn context and preserves tool-related messages.

## Tool Registration Notes

Agent definitions list tool names, but execution requires a runtime tool registry.

- Agent definition tools are declared in Agent/AgentPresets.ts or inline definitions.
- The registry is resolved in Agent/AgentConfig.ts via ToolRegistry.
- If declared tool names are missing from runtime.toolRegistry, a warning is logged and those tools are skipped.

Minimal runtime pattern:

```ts
const agent = new Agent(agentDefinition, {
  provider: { name: "openai", model: "gpt-4o-mini" },
  toolRegistry: {
    // toolName: { tool, info }
  },
});
```

## Bridge Tools

The Web3 bridge stack currently exposes four bridge-oriented tools:

- `bridge_discovery`: Queries LayerZero Value Transfer API to list destination tokens/chains for a given source chain and token address.
- `bridge_quote`: Simulates a bridge route and returns route status plus summary fields.
- `bridge_execute`: Executes a bridge transaction (or preview with dry-run mode).
- `bridge_status`: Tracks bridge transaction state by source chain and transaction hash.

Recommended assistant flow:

1. Call `bridge_discovery` first to validate whether a token is transferable and discover valid destination token variants.
2. Use one discovered destination token route with `bridge_quote`.
3. If quote is acceptable, call `bridge_execute`.
4. Poll `bridge_status` until terminal state.

Important notes:

- LayerZero may return `422 Unsupported token` for some chain/token pairs. This is expected when the pair is not transferable.
- A route can exist at discovery time and still fail execution-time validation due to provider-level constraints.

## CoinMarketCap Token Data

The token-data tool fetches CoinMarketCap metadata and quote data with optional field projection.

- Tool name: `cex_token_data_tool`
- Runtime export: `TokenDataTool`
- Preferred lookup for collision-safe requests: `ids`
- Convenience lookup: `symbols`

Behavior notes:

- If you pass `ids`, the tool returns the exact CoinMarketCap token for each id.
- If you pass `symbols`, the tool returns all matching tokens for each symbol, which is useful when a ticker is shared by more than one asset.
- Core identity fields are always preserved in projected responses.
- `fields` controls the compact projection path.
- `quote_last_updated` maps to the quote timestamp.

CLI examples:

```bash
npx tsx src/Tools/web3/tools/marketData/getTokenData/script.ts symbols=pol currency=gbp fields=price,market_cap,platform
```

```bash
npx tsx src/Tools/web3/tools/marketData/getTokenData/script.ts ids=38769 currency=gbp
```

```bash
npx tsx src/Tools/web3/tools/marketData/getTokenData/script.ts symbols=kat currency=gbp debug=fields
```

Debug note:

- `debug=fields` applies a compact preset of `price`, `market_cap`, `tags`, and `quote_last_updated` when `fields` is omitted.
- If `fields` is explicitly provided, that selection wins over the debug preset.

## Providers Available

Provider registry is defined in llm/providers/index.ts:

- openai
- deepseek
- anthropic
- local
- ollama

## Project Layout

```text
Agent/
  AgentConfig.ts
  AgentPresets.ts
  messages.ts
  types.ts
ReasoningExecutor/
  ReasoningExecutor.ts
ToolExecutor/
  index.ts
  toolExecutor.ts
  toolRegistry.ts
llm/
  providers/
main.ts
example.ts
```

## Troubleshooting

- Error: Provider "x" not registered
  - Set AI_PROVIDER to one of: openai, deepseek, anthropic, local, ollama.

- API key not provided
  - Set the provider-specific API key in .env.

- Tools not running
  - Ensure tool names in agent definition match keys in runtime toolRegistry.

## Current Behavior Summary

- main.ts: Interactive multi-turn CLI with dynamic message array.
- example.ts: One-shot example request for fast smoke testing.

## Project Status

- Server implementation has started
- Core Web3 tools are functional
- Ongoing hardening/refactor pass for consistency and production readiness

## Next Steps

- Complete server endpoints and integration flow
- Standardize and clean Web3 tool modules (naming, structure, validation)
- Add/expand verification scripts and tests