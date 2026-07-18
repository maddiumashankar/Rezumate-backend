import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "groq-sdk/resources/chat/completions";
import logger from "../utils/logger";

// ─── Provider Configuration ────────────────────────────────────────────────

export type LLMProvider = "groq" | "ollama" | "openai" | "gemini";

interface ProviderConfig {
  provider: LLMProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  maxTokens: number;
}

const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  groq: {
    provider: "groq",
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    maxTokens: 4096,
  },
  ollama: {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL || "qwen2:1.5b",
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    maxTokens: 4096,
  },
  openai: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    maxTokens: 4096,
  },
  gemini: {
    provider: "gemini",
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    maxTokens: 4096,
  },
};

function getActiveProvider(): LLMProvider {
  return (process.env.LLM_PROVIDER as LLMProvider) || "groq";
}

function getProviderConfig(provider?: LLMProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider || getActiveProvider()];
}

// Fallback chain: if primary provider fails, try these in order
const FALLBACK_CHAIN: LLMProvider[] = ["groq", "ollama"];

// ─── Rate Limiting ─────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // per user per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

export function assertRateLimit(userId: string): void {
  if (!checkRateLimit(userId)) {
    throw new Error("Rate limit exceeded. Please wait a moment before trying again.");
  }
}

// ─── Shared Types ──────────────────────────────────────────────────────────

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface LLMToolResult {
  tool_use_id: string;
  content: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, any>;
  id: string;
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
  provider: LLMProvider;
}

// ─── Retry Logic ───────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRetryable =
        err.message?.includes("429") ||
        err.message?.includes("rate") ||
        err.message?.includes("timeout") ||
        err.message?.includes("ECONNREFUSED") ||
        err.status === 429 ||
        err.status === 503;

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      logger.warn(`LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ─── Provider Implementations ──────────────────────────────────────────────

// --- Groq ---

function getGroqClient(config: ProviderConfig): Groq {
  return new Groq({ apiKey: config.apiKey || "" });
}

function convertToolsToGroq(tools: LLMToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function callGroq(
  messages: ChatCompletionMessageParam[],
  config: ProviderConfig,
  tools?: ChatCompletionTool[],
  maxTokens?: number
): Promise<LLMResponse> {
  const client = getGroqClient(config);
  const params: any = {
    model: config.model,
    messages,
    max_tokens: maxTokens || config.maxTokens,
  };
  if (tools && tools.length > 0) {
    params.tools = tools;
  }

  const result = await client.chat.completions.create(params);
  const choice = result.choices[0];
  const message = choice?.message;
  const usage = result.usage;

  const toolCalls: ToolCall[] = (message?.tool_calls || []).map((tc) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || "{}"),
    id: tc.id,
  }));

  return {
    text: message?.content || "",
    toolCalls,
    stopReason: choice?.finish_reason || "stop",
    usage: {
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
    },
    provider: "groq",
  };
}

// --- Ollama ---

async function callOllama(
  messages: ChatCompletionMessageParam[],
  config: ProviderConfig,
  maxTokens?: number
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || "http://localhost:11434";
  const body = {
    model: config.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
    stream: false,
    options: {
      num_predict: maxTokens || config.maxTokens,
    },
  };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as any;

  return {
    text: data.message?.content || "",
    toolCalls: [],
    stopReason: data.done ? "stop" : "length",
    usage: {
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
    },
    provider: "ollama",
  };
}

// --- Unified provider dispatch ---

async function callProvider(
  messages: ChatCompletionMessageParam[],
  provider?: LLMProvider,
  tools?: LLMToolDefinition[],
  maxTokens?: number
): Promise<LLMResponse> {
  const config = getProviderConfig(provider);

  switch (config.provider) {
    case "groq":
      return callGroq(
        messages,
        config,
        tools ? convertToolsToGroq(tools) : undefined,
        maxTokens
      );

    case "ollama":
      return callOllama(messages, config, maxTokens);

    case "openai":
      // OpenAI uses the same API format as Groq (OpenAI-compatible)
      const openaiClient = new Groq({
        apiKey: config.apiKey || "",
        baseURL: "https://api.openai.com/v1",
      });
      const openaiConfig = { ...config, apiKey: config.apiKey };
      return callGroq(
        messages,
        openaiConfig,
        tools ? convertToolsToGroq(tools) : undefined,
        maxTokens
      );

    case "gemini":
      // For now, fall back to Groq for Gemini — can add native Gemini SDK later
      logger.warn("Gemini provider not yet native — falling back to Groq");
      return callGroq(
        messages,
        PROVIDER_CONFIGS.groq,
        tools ? convertToolsToGroq(tools) : undefined,
        maxTokens
      );

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// --- Provider with fallback ---

async function callProviderWithFallback(
  messages: ChatCompletionMessageParam[],
  tools?: LLMToolDefinition[],
  maxTokens?: number
): Promise<LLMResponse> {
  const primary = getActiveProvider();
  const chain = [primary, ...FALLBACK_CHAIN.filter((p) => p !== primary)];

  let lastError: Error | null = null;

  for (const provider of chain) {
    try {
      return await withRetry(() => callProvider(messages, provider, tools, maxTokens));
    } catch (err: any) {
      lastError = err;
      logger.warn(`Provider ${provider} failed: ${err.message}. Trying next...`);
    }
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Simple wrapper: send a prompt, get text back.
 * Uses the active provider with fallback chain.
 */
export async function callLLM(
  userMessage: string,
  systemPrompt?: string,
  maxTokens: number = 4096
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; provider: LLMProvider }> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt || "You are a helpful AI assistant." },
    { role: "user", content: userMessage },
  ];

  const result = await callProviderWithFallback(messages, undefined, maxTokens);

  return {
    text: result.text,
    usage: result.usage,
    provider: result.provider,
  };
}

/**
 * Call LLM with tool definitions. Returns on first response (may include function calls).
 */
export async function callLLMWithTools(
  history: ChatCompletionMessageParam[],
  tools: LLMToolDefinition[],
  systemPrompt: string,
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  return callProviderWithFallback(messages, tools, maxTokens);
}

/**
 * Full agentic tool-use loop: LLM calls tools, we execute them, feed results back, repeat.
 * `toolExecutor` is a function that runs the tool and returns a string result.
 *
 * Yields intermediate events for streaming UI updates.
 */
export async function agenticToolLoop(
  initialPrompt: string,
  systemPrompt: string,
  tools: LLMToolDefinition[],
  toolExecutor: (toolName: string, input: Record<string, any>) => Promise<string>,
  maxIterations: number = 10,
  onEvent?: (event: AgentEvent) => void
): Promise<{
  finalText: string;
  allToolCalls: Array<{ name: string; input: any; result: string }>;
  totalUsage: { inputTokens: number; outputTokens: number };
}> {
  const groqTools = convertToolsToGroq(tools);
  const allToolCalls: Array<{ name: string; input: any; result: string }> = [];
  let totalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = "";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialPrompt },
  ];

  for (let i = 0; i < maxIterations; i++) {
    onEvent?.({ type: "iteration_start", iteration: i + 1, maxIterations });

    const result = await callProviderWithFallback(messages, tools);

    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;

    // Append assistant message to history
    const assistantMessage: any = { role: "assistant", content: result.text };
    if (result.toolCalls.length > 0) {
      assistantMessage.tool_calls = result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    messages.push(assistantMessage);

    // If no tool calls, we're done
    if (result.toolCalls.length === 0) {
      finalText = result.text;
      onEvent?.({ type: "complete", text: finalText });
      break;
    }

    // Execute each tool call and add results to messages
    for (const tc of result.toolCalls) {
      let toolResultStr: string;

      try {
        onEvent?.({ type: "tool_start", tool: tc.name, input: tc.args });
        logger.debug(`Executing tool: ${tc.name}`);
        toolResultStr = await toolExecutor(tc.name, tc.args);
        allToolCalls.push({ name: tc.name, input: tc.args, result: toolResultStr });
        onEvent?.({ type: "tool_complete", tool: tc.name, result: toolResultStr });
      } catch (err: any) {
        logger.error(`Tool ${tc.name} failed: ${err.message}`);
        toolResultStr = JSON.stringify({ error: err.message });
        onEvent?.({ type: "tool_error", tool: tc.name, error: err.message });
      }

      const toolMessage: ChatCompletionToolMessageParam = {
        role: "tool",
        tool_call_id: tc.id,
        content: toolResultStr,
      };
      messages.push(toolMessage);
    }
  }

  // If loop ended without getting final text, extract from last assistant message
  if (!finalText) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant && "content" in lastAssistant) {
      finalText = (lastAssistant.content as string) || "";
    }
  }

  return { finalText, allToolCalls, totalUsage };
}

// ─── Agent Event Types (for streaming) ─────────────────────────────────────

export type AgentEvent =
  | { type: "iteration_start"; iteration: number; maxIterations: number }
  | { type: "tool_start"; tool: string; input: any }
  | { type: "tool_complete"; tool: string; result: string }
  | { type: "tool_error"; tool: string; error: string }
  | { type: "complete"; text: string };

// ─── JSON Parsing Utility ──────────────────────────────────────────────────

/**
 * Parse structured JSON from LLM's response text.
 */
export function parseJsonFromResponse<T>(text: string): T | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { }
  }

  // Try to find raw JSON (object)
  const jsonObjMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    try {
      return JSON.parse(jsonObjMatch[0]);
    } catch { }
  }

  // Try to find raw JSON (array)
  const jsonArrMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrMatch) {
    try {
      return JSON.parse(jsonArrMatch[0]);
    } catch { }
  }

  return null;
}

// ─── Utility Exports ───────────────────────────────────────────────────────

export { getActiveProvider, getProviderConfig, PROVIDER_CONFIGS };
