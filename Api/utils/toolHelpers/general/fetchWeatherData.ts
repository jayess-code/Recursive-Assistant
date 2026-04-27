export async function fetchWeather(
  location: string,
  apiKey?: string
): Promise<string> {
  const normalizedLocation = location?.trim() || "unknown location";

  if (!apiKey) {
    return `Weather lookup skipped for ${normalizedLocation}: missing OPENWEATHER_API key.`;
  }

  return `Weather lookup placeholder for ${normalizedLocation}.`;
}
