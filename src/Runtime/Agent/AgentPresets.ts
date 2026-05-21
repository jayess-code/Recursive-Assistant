import type { AgentDefinition } from "./AgentConfig";

// This file defines preset agent configurations that can be easily imported and used throughout the application. Each agent has a unique set of tools, capabilities, and instructions that define its behavior and interactions. These presets serve as templates for creating new agents with similar functionalities or for testing purposes.
// Note: The agents defined here are placeholders and can be expanded with additional tools, capabilities, and authentication methods as needed in the future.

// general purpose agent without auth and tools, can be used for testing or as a base template for other agents
export const AgentTyrone: AgentDefinition = {
  id: "1",
  name: "Tyrone",
  description: " an assistant that can help with a wide range of tasks, from answering questions to providing recommendations.",
    // capabilities: ["chat", "question answering", "recommendations"],

  tools: [],
  instructions: {
    basePrompt: "You are a helpful and thoughtful assistant that can help with a wide range of tasks, from answering questions to providing recommendations. You should always try to provide accurate and helpful information to the user. If you don't know the answer to a question, it's okay to say that you don't know. You should also be able to ask the user for more information if you need it to provide a better answer.",
  },
};

// weather agent with wallet auth and web3 tools will be added in the future, currently we can use AgentTyrone as a placeholder for that purpose
export const AgentSamantha: AgentDefinition = {
  id: "2",
  name: "Samantha",
  description: "A helpful assistant that provides information about the cryptocurrency market.",
  // capabilities: ["weather information"],
  tools: ["get_weather"],
  instructions: {
    basePrompt: "You are a helpful assistant that provides information about the cryptocurrency market.",
  },
};

// swapping agent with wallet auth and web3 tools will be added in the future, currently we can use AgentJoe as a placeholder for that purpose
export const AgentJoe: AgentDefinition = {
  id: "3",
  name: "Joe",
  description: "A helpful assistant that provides information about the cryptocurrency market.",
  // capabilities: ["cryptocurrency information"],
  auth: {
    wallets: [
      {
        name: "Joe's main EVM Wallet",
        description: "Joe's primary EVM compatible wallet",
        protocol: "EVM",
        // address: "",
        // privatekey: process.env.AGENT_JOE_WALLET_PRIVATE_KEY || "",
      },
    ],
  },
  tools: [
    "get_available_chains",
     "get_crypto_wallet_address", 
     "get_portfolio_balances",
     "fetch_token_pairs",
     "cex_token_data_tool",
     "swap_detect",
     "swap_quote",
     "swap_build",
     "manage_allowances",
     "send_transaction",
     "search_token"
    ],
  instructions: {
    basePrompt: "You are a helpful assistant that that has its own wallet and provides information about the cryptocurrency market. You are also skilled at helping users navigate decentralized exchanges, providing swap quotes, and executing swap transactions securely. Always ensure that you provide accurate information and prioritize security when assisting with swap transactions.",
  },
};
// bridging agent with wallet auth and web3 tools will be added in the future, currently we can use AgentJoe as a placeholder for that purpose
export const AgentBobby: AgentDefinition = {
  id: "4",
  name: "Bobby",
  description: "A helpful assistant that provides information about the cryptocurrency market. Bobby is also skilled at helping users navigate cross-chain bridges, providing quotes, and executing bridge transactions securely.",
  // capabilities: ["cryptocurrency information"],
  auth: {   
    wallets: [
      {
        name: "Bobby's main EVM Wallet",
        description: "Bobby's primary EVM compatible wallet",
        protocol: "EVM",
        // address: "",
        // privatekey: process.env.AGENT_BOBBY_WALLET_PRIVATE_KEY || "",
      },
    ],
},
  tools: [
    "get_available_chains",
      "get_crypto_wallet_address",
      "get_portfolio_balances",
      "fetch_token_pairs",
      "cex_token_data_tool",
      "bridge_discovery",
      "bridge_quote",
      "bridge_execute",
      "bridge_status",
      // "search_token"
    ],
  instructions: {
    basePrompt: "You are a helpful assistant with your own wallet that provides information about the cryptocurrency market. You are also skilled at helping users navigate cross-chain bridges, providing quotes, and executing bridge transactions securely. Always ensure that you provide accurate information and prioritize security when assisting with bridge transactions.",
  },
};

export const AgentPresets = {
  AgentTyrone,
  AgentSamantha,
  AgentJoe,
  AgentBobby,
} as const satisfies Record<string, AgentDefinition>;

export type AgentPresetKey = keyof typeof AgentPresets;

