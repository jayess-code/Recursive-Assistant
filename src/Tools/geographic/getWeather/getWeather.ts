import type { GetWeatherArgs } from "./getWeatherTool";
import type { ToolResponse } from "../../types/toolResponse";

const OPENWEATHER_API = process.env.OPENWEATHER_API;

export async function getWeather(
    args: GetWeatherArgs
): Promise<string> {
    const { location } = args;
    if (!OPENWEATHER_API) {
        return JSON.stringify({
            success: true,
            data: {
                mock: true,
                location,
                weather: [{ main: "Partly Cloudy", description: "partly cloudy sky" }],
                main: { temp: 22, feels_like: 20, humidity: 65 },
                note: "Mock response: Set OPENWEATHERMAP_API_KEY to use real weather data"
            }
        } as ToolResponse);
    }
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${OPENWEATHER_API}&units=metric`;
   console.log(`Requesting weather data`);

    const response = await fetch(apiUrl);
// console.log(`Received response from weather API:`, response);
    if (!response.ok) {
        const errorText = await response.text();
        return JSON.stringify({
            success: false,
            error: `Error fetching weather: ${response.statusText} - ${errorText}`,
        } as ToolResponse);
    }

    const data = await response.json();
console.log(`Received weather data:`, data);
    if (!data.weather || !data.main) {
        return JSON.stringify({
            success: false,
            error: `Unexpected API response format for ${location}.`,
        } as ToolResponse);
    }

    // console.log(`Weather data for ${location}:`, data);
    return JSON.stringify({
        success: true,
        data,
    } as ToolResponse);

}