import "dotenv/config";

const API_URL = "https://api.sarvam.ai/v2/chat/completions";
const MODEL = "glm5.3";
const REQUEST_TIMEOUT_MS = 120000;

async function requestCompletion(messages, {
  signal,
  tools,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.SARVAM_API_KEY;

  if (!apiKey) {
    throw new Error("SARVAM_API_KEY missing from .env");
  }

  if (signal?.aborted) {
    const error = new Error("Agent execution cancelled");
    error.name = "AbortError";
    throw error;
  }

  const requestController = new AbortController();

  const timeout = setTimeout(() => {
    requestController.abort("timeout");
  }, REQUEST_TIMEOUT_MS);

  const abortRequest = () => requestController.abort("cancelled");

  signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    console.log("[Sarvam] Sending API request...");

    const body = {
      model: MODEL,
      messages,
      reasoning_effort: "low",
      max_tokens: 1200
    };

    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
      body.parallel_tool_calls = false;
    }

    const response = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey
      },
      signal: requestController.signal,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `Sarvam API ${response.status}: ${JSON.stringify(data)}`
      );
    }

    const message = data.choices?.[0]?.message;

    if (!message) {
      throw new Error("Invalid response from Sarvam");
    }

    console.log("[Sarvam] Response received.");

    return message;

  } catch (error) {
    if (signal?.aborted) {
      const cancelled = new Error("Agent execution cancelled");
      cancelled.name = "AbortError";
      throw cancelled;
    }

    if (requestController.signal.aborted) {
      throw new Error("Sarvam request timed out after 120 seconds");
    }

    throw error;

  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export async function runSarvamToolLoop(messages, {
  signal,
  tools,
  executeTool,
  maxToolCalls = 8,
  fetchImpl = fetch
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Messages must be a non-empty array");
  }

  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("At least one tool definition is required");
  }

  if (typeof executeTool !== "function") {
    throw new Error("executeTool callback is required");
  }

  if (!Number.isInteger(maxToolCalls) || maxToolCalls < 1 || maxToolCalls > 20) {
    throw new Error("maxToolCalls must be between 1 and 20");
  }

  const conversation = [...messages];
  let executedToolCalls = 0;

  while (true) {
    if (signal?.aborted) {
      const error = new Error("Agent execution cancelled");
      error.name = "AbortError";
      throw error;
    }

    const message = await requestCompletion(conversation, {
      signal,
      tools,
      fetchImpl
    });

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length > 0) {
      if (executedToolCalls + toolCalls.length > maxToolCalls) {
        throw new Error(`Maximum tool-call limit (${maxToolCalls}) reached`);
      }

      // Preserve the assistant's original tool-call message.
      conversation.push(message);

      // Execute sequentially even if the API unexpectedly returns multiple.
      for (const toolCall of toolCalls) {
        if (!toolCall.id || !toolCall.function?.name) {
          throw new Error("Malformed Sarvam tool call");
        }

        let args;

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = null;
        }

        let result;

        try {
          if (!args || typeof args !== "object" || Array.isArray(args)) {
            throw new Error("Tool arguments must be a valid JSON object");
          }

          result = await executeTool(
            toolCall.function.name,
            args
          );

        } catch (error) {
          if (error.name === "AbortError" || signal?.aborted) {
            const cancelled = new Error("Agent execution cancelled");
            cancelled.name = "AbortError";
            throw cancelled;
          }

          result = { error: error.message };
        }

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result ?? { success: true })
        });

        executedToolCalls++;

        console.log(
          `[Tool Executor] ${toolCall.function.name} executed (${executedToolCalls}/${maxToolCalls})`
        );
      }

      continue;
    }

    if (typeof message.content !== "string" || !message.content.trim()) {
      throw new Error("Sarvam returned neither tool calls nor text content");
    }

    return message.content;
  }
}

export async function askSarvam(messages, { signal } = {}) {
  const message = await requestCompletion(messages, { signal });

  if (typeof message.content !== "string" || !message.content.trim()) {
    throw new Error("Empty response from Sarvam");
  }

  return message.content;
}
