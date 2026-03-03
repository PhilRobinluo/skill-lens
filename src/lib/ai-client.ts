import OpenAI from "openai";
import { ProxyAgent } from "undici";
import { readSettings } from "./settings";

// ---------------------------------------------------------------------------
// getProxyFetchOptions — configure proxy for Node.js fetch (undici)
// Node.js native fetch does NOT respect HTTP_PROXY env vars, so we must
// explicitly pass a ProxyAgent via fetchOptions.
// ---------------------------------------------------------------------------
function getProxyFetchOptions(): Record<string, unknown> | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;
  if (!proxyUrl) return undefined;
  return { dispatcher: new ProxyAgent(proxyUrl) };
}

// ---------------------------------------------------------------------------
// createAIClient — create an OpenAI-compatible client pointed at OpenRouter
// ---------------------------------------------------------------------------
export async function createAIClient(): Promise<OpenAI> {
  const settings = await readSettings();
  if (!settings.openRouterApiKey) {
    throw new Error("API Key 未配置。请在设置中填入 OpenRouter API Key。");
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: settings.openRouterApiKey,
    fetchOptions: getProxyFetchOptions(),
  });
}

// ---------------------------------------------------------------------------
// chatCompletion — call chat.completions.create with system + user message
// ---------------------------------------------------------------------------
export async function chatCompletion(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const settings = await readSettings();
  const client = await createAIClient();

  try {
    const response = await client.chat.completions.create({
      model: settings.aiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI 返回了空内容");
    return content;
  } catch (err: unknown) {
    // Extract meaningful error from OpenRouter/OpenAI error responses
    if (err && typeof err === "object" && "error" in err) {
      const apiErr = (err as { error?: { message?: string } }).error;
      if (apiErr?.message) throw new Error(apiErr.message);
    }
    if (err instanceof Error && err.message) throw err;
    throw new Error("AI 调用失败，请检查 API Key 和模型设置");
  }
}

// ---------------------------------------------------------------------------
// parseAIJson — safely parse JSON from AI response (strip markdown fences)
// ---------------------------------------------------------------------------
export function parseAIJson<T>(raw: string): T {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned) as T;
}
