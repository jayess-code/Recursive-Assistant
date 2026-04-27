import type { GetWeatherArgs } from "./getWeatherTool.js";

const OPENWEATHER_API = process.env.OPENWEATHER_API;

export async function getWeather(
    args: GetWeatherArgs
): Promise<string> {
    const { location } = args;
    if (!OPENWEATHER_API) {
        return JSON.stringify({
            mock: true,
            location,
            weather: [{ main: "Partly Cloudy", description: "partly cloudy sky" }],
            main: { temp: 22, feels_like: 20, humidity: 65 },
            note: "Mock response: Set OPENWEATHERMAP_API_KEY to use real weather data"
        });
    }
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${OPENWEATHER_API}&units=metric`;
   console.log(`Requesting weather data`);

    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        return `Error fetching weather: ${response.statusText} - ${errorText}`
    }

    const data = await response.json();

    if (!data.weather || !data.main) {
        return `Unexpected API response format for ${location}.`;
    }

    // console.log(`Weather data for ${location}:`, data);
    return JSON.stringify(data)

}