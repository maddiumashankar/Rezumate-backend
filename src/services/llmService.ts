import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "groq-sdk/resources/chat/completions";
import logger from "../utils/logger";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ─── Shared Types (unchanged public API) ───────────────────────────────────

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
}

// ─── Tool Conversion ───────────────────────────────────────────────────────

/**
 * Convert our generic tool definitions to Groq/OpenAI tool format.
 */
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

// ─── Simple Call ────────────────────────────────────────────────────────────

/**
 * Simple wrapper: send a prompt, get text back.
 */
export async function callLLM(
  userMessage: string,
  systemPrompt?: string,
  maxTokens: number = 4096
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt || "You are a helpful AI assistant." },
    { role: "user", content: userMessage },
  ];

  const result = await groq.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
  });

  const text = result.choices[0]?.message?.content || "";
  const usage = result.usage;

  return {
    text,
    usage: {
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
    },
  };
}

// ─── Call with Tools ────────────────────────────────────────────────────────

/**
 * Call Groq with tool definitions. Returns on first response (may include function calls).
 */
export async function callLLMWithTools(
  history: ChatCompletionMessageParam[],
  tools: LLMToolDefinition[],
  systemPrompt: string,
  maxTokens: number = 4096
): Promise<LLMResponse> {
  const groqTools = convertToolsToGroq(tools);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  const result = await groq.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    tools: groqTools,
  });

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
  };
}

// ─── Agentic Tool Loop ─────────────────────────────────────────────────────

/**
 * Full agentic tool-use loop: Groq calls tools, we execute them, feed results back, repeat.
 * `toolExecutor` is a function that runs the tool and returns a string result.
 */
export async function agenticToolLoop(
  initialPrompt: string,
  systemPrompt: string,
  tools: LLMToolDefinition[],
  toolExecutor: (toolName: string, input: Record<string, any>) => Promise<string>,
  maxIterations: number = 10
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
    const result = await groq.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 4096,
      tools: groqTools,
    });

    const choice = result.choices[0];
    const message = choice?.message;
    const usage = result.usage;

    totalUsage.inputTokens += usage?.prompt_tokens || 0;
    totalUsage.outputTokens += usage?.completion_tokens || 0;

    // Append assistant message to history
    messages.push(message as ChatCompletionMessageParam);

    const toolCallsInResponse = message?.tool_calls || [];

    // If no tool calls, we're done
    if (toolCallsInResponse.length === 0) {
      finalText = message?.content || "";
      break;
    }

    // Execute each tool call and add results to messages
    for (const tc of toolCallsInResponse) {
      const toolName = tc.function.name;
      let toolResultStr: string;

      try {
        logger.debug(`Executing tool: ${toolName}`);
        const parsedArgs = JSON.parse(tc.function.arguments || "{}");
        toolResultStr = await toolExecutor(toolName, parsedArgs);
        allToolCalls.push({ name: toolName, input: parsedArgs, result: toolResultStr });
      } catch (err: any) {
        logger.error(`Tool ${toolName} failed: ${err.message}`);
        toolResultStr = JSON.stringify({ error: err.message });
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

// ─── JSON Parsing Utility ───────────────────────────────────────────────────

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

// Backward-compatible alias so existing imports of callClaude still work
export const callClaude = callLLM;
