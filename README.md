# AI Reasoning

A TypeScript agent framework with a reasoning loop, multi-provider LLM support, and tool execution.

## What This Project Does

- Runs a reasoning loop that can call tools over multiple iterations.
- Supports multiple model providers: OpenAI, DeepSeek, Anthropic, Local, and Ollama.
- Provides an interactive CLI chat in main.ts with dynamic in-memory conversation history.
- Includes a minimal one-shot example runner in example.ts.

## Requirements

- Node.js 18+
- npm

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
