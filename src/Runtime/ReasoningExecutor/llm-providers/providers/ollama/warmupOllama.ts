type WarmupOptions = {
  host?: string;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1";
const DEFAULT_TIMEOUT_MS = 45000;

export async function warmupOllama(options: WarmupOptions = {}): Promise<void> {
  const host = options.host || process.env.OLLAMA_HOST || DEFAULT_HOST;
  const model = options.model || process.env.OLLAMA_DEFAULT_MODEL || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: "hello",
        stream: false,
        options: {
          num_predict: 1,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(`Warmup failed (${response.status}): ${payload || response.statusText}`);
    }

    console.log(`🦙 Ollama warmup complete for model: ${model}`);
  } finally {
    clearTimeout(timer);
  }
}
