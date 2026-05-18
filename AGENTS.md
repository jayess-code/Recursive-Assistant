
---
name: tool_Registry-global
description: |
	Always-on instructions for this repo. Reinforce handler conventions, file structure, and Web3-specific rules for tool and implementation files.
applyTo: '**'
---

# tool_Registry — Copilot Always-On Instructions

# Why we are building this Repo
- Build a Web3 tool stack for autonomous agents, starting with EVM-compatible chains via viem chain keys.

## Tool Creation
For tool creation or modification, invoke `createtool` for conventions, schema rules, naming, scaffolding, and verification.

## Sub-Agent Routing
- Invoke `tommy` for repo-wide tool architecture, tool gap analysis, duplicate detection, and keep/merge/deprecate recommendations.
- Invoke `bradley` for bridge-specific architecture decisions, bridge tool coverage, bridge debugging support, and bridge tool consolidation planning.
- Invoke `dexter` for DEX/swap-specific architecture decisions, DEX tool coverage, and DEX tool consolidation planning.
- Keep this section routing-only; do not duplicate specialist instructions.

## Agent Docs and Privacy Policy
- Keep this file public and professional: only stable guidance that collaborators need.
- Keep personal experimentation notes, prompt drafts, and scratch agent logic in local-only files.
- `.github` is ignored by default in this repo except `.github/workflows`.
- If AGENTS references local-only files, ensure those references are optional and not required for project operation.
- Use `*.private.md` or `*.local.md` suffixes for personal notes so they stay out of commits.

## Web3-Specific Rules
- Use viem clients via `Tools/web3/clients/viem/createViemPublicClient.ts` and `createViemWalletClient.ts`.
- Import chain constants only from `Tools/web3/clients/viem/viemChains.ts`.
- Never import chain constants directly from other files or hardcode them.

## Data Source Priority
- Prefer on-chain data over off-chain APIs when possible.
- Use DexScreener, CoinMarketCap, Alchemy, etc. only when on-chain data is impractical (for example, price discovery or pair enumeration).
- When mixing sources, annotate results with the `sources` field so consumers can assess reliability.

# How to Build, Test and Verify changes

## Build
```bash
npm run build
```
Compiles TypeScript via `tsc` to `dist/`. Fix type errors before committing.

## Run (Development)
```bash
npm run dev
```
Runs `tsx example.ts` for quick development iteration.

## Test
```bash
npm test
```
No test runner is configured yet. New implementation files should be verified via a debug script.

## Debug Scripts
One-off scripts live in `Tools/web3/scripts/`. Run them directly with tsx:
```bash
npx tsx Tools/web3/scripts/debugViemChain.ts          # Verify a viem chain config
npx tsx Tools/web3/scripts/debugAlchemyChains.ts       # List supported Alchemy chains
npx tsx Tools/web3/scripts/fetchPolygonWalletTokens.ts # Fetch live wallet token data
npx tsx Tools/web3/scripts/debugBridgeTools.ts         # Quote/execute/status bridge diagnostics
npx tsx Tools/web3/scripts/debugBridgeDiscovery.ts     # LayerZero bridge destination discovery diagnostics
```

For tool-specific verification steps, refer to the `createtool` skill.