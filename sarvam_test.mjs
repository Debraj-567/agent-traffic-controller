import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const key = env.match(/^SARVAM_API_KEY=(.+)$/m)?.[1]?.trim();

if (!key) throw new Error("SARVAM_API_KEY missing from .env");

const response = await fetch(
  "https://api.sarvam.ai/v2/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": key
    },
    body: JSON.stringify({
      model: "glm5.3",
      messages: [{
        role: "user",
        content: "Explain AI agent deadlock detection in two sentences."
      }],
      reasoning_effort: "low",
      max_tokens: 2000
    })
  }
);

const data = await response.json();

if (!response.ok) {
  throw new Error(`API error ${response.status}: ${data.error?.message ?? "Unknown error"}`);
}

const reply = data.choices?.[0]?.message?.content;

if (!reply) {
  console.log("No final answer returned. Finish reason:", data.choices?.[0]?.finish_reason);
  process.exitCode = 1;
} else {
  console.log(reply);
}
