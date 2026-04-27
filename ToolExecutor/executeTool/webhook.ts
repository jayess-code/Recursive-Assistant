import type { ToolExecutionContext } from "../toolExecutor.js";

export interface WebhookToolInfo {
  source: "webhook";
  webhook: {
    url: string; // e.g., "https://api.example.com/execute"
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; // default: POST
    headers?: Record<string, string>; // custom auth, content-type, etc.
    timeout?: number; // milliseconds, default: 30000
  };
}

/**
 * Execute a tool via external HTTP webhook/API.
 * Supports custom headers, methods, and timeouts.
 */
export async function executeWebhook(
  toolName: string,
  args: any,
  context: ToolExecutionContext,
  webhookInfo: WebhookToolInfo["webhook"]
) {
  const {
    url,
    method = "POST",
    headers = {},
    timeout = 30000,
  } = webhookInfo;

  if (!url) {
    throw new Error(`Webhook tool "${toolName}" missing webhook.url configuration`);
  }

  // Build request payload
  const payload = {
    tool: toolName,
    arguments: args,
    context: {
      assistantId: context.assistantId,
      conversationId: context.conversationId,
    },
    timestamp: new Date().toISOString(),
  };

  // Prepare request options
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
  const requestInit: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    signal: AbortSignal.timeout(timeout),
  };

  if (isBodyMethod) {
    requestInit.body = JSON.stringify(payload);
  } else if (method === "GET") {
    // For GET, append args as query params
    const queryParams = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      queryParams.append(key, JSON.stringify(value));
    });
    const finalUrl = `${url}?${queryParams.toString()}`;
    return fetchWebhook(finalUrl, requestInit, toolName);
  }

  return fetchWebhook(url, requestInit, toolName);
}

/**
 * Fetch helper with error handling and response parsing.
 */
async function fetchWebhook(
  url: string,
  requestInit: RequestInit,
  toolName: string
): Promise<any> {
  try {
    const response = await fetch(url, requestInit);

    // Handle non-OK responses
    if (!response.ok) {
      const errorBody = await response.text();
      const errorMsg = `Webhook execution failed for tool "${toolName}": HTTP ${response.status} ${response.statusText}`;
      
      console.error(errorMsg, {
        url,
        status: response.status,
        body: errorBody,
      });

      throw new Error(`${errorMsg} - ${errorBody}`);
    }

    // Parse response
    const contentType = response.headers.get("Content-Type") || "";
    let result: any;

    if (contentType.includes("application/json")) {
      result = await response.json();
    } else if (contentType.includes("text")) {
      result = { text: await response.text() };
    } else {
      result = { data: await response.arrayBuffer() };
    }

    console.log(`✅ Webhook execution complete for tool "${toolName}":`, {
      status: response.status,
      result,
    });

    return result;
  } catch (error) {
    // Handle timeout and network errors
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Webhook execution timeout for tool "${toolName}": request exceeded timeout`
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        `Webhook network error for tool "${toolName}": ${error.message}`
      );
    }

    // Re-throw other errors
    throw error;
  }
}
