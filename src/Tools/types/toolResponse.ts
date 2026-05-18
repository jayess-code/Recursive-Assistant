/**
 * Unified response contract for all tools.
 * Tools never throw exceptions; they return structured responses as JSON strings.
 */

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper to wrap async tool logic and automatically handle errors.
 * Usage:
 *   return toToolResponse(async () => {
 *     const result = await someAsyncOperation();
 *     return result;
 *   });
 *
 * This will catch any thrown errors and return them as `{ success: false, error: "..." }`.
 */
export async function toToolResponse<T>(
  fn: () => Promise<T>
): Promise<string> {
  try {
    const data = await fn();
    return JSON.stringify({
      success: true,
      data,
    } as ToolResponse<T>);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    } as ToolResponse<T>);
  }
}
