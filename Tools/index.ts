import { getWeatherTool } from "./geographic/getWeather/getWeatherTool.js";
import type { ToolConfig } from "../ToolExecutor/toolConfig.js";

export const localTools: Record<string, ToolConfig> = {
    get_weather: getWeatherTool,
};
