import { getWeather } from "./getWeather";
import type { ToolConfig, ToolParameters } from "../../../Runtime/ToolExecutor/toolConfig";

export type GetWeatherArgs  ={
    location: string;
}

const parameters: ToolParameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        location: {
            type: "string",
            description: "The city or location to get the current weather for.",
        },
    },
    required: ["location"],
};

export const getWeatherTool: ToolConfig<GetWeatherArgs> = {
    tool: {
        type: "function",
        name: "get_weather",
        description: "A tool that simulates fetching the current weather for a given location.",
        parameters,
        strict: true,
        exampleCalls: [
            { location: "Libya" },
            { location: "New York" },
        ],
        handler: async (args: GetWeatherArgs) => {
            return getWeather(args);
        },
        
    },
    info: {
        // category: "weather",
    }
}
