import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY || "").trim() });
  }
  return _openai;
}

const DEFAULT_MODEL = "gpt-5-mini";

export async function generateResponse(opts: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<string> {
  const desiredOutput = opts.maxTokens ?? 300;
  // gpt-5-mini uses reasoning tokens from the same budget.
  // Start with 4096 padding for reasoning overhead; retry with 8192 if empty.
  const budgets = [desiredOutput + 4096, desiredOutput + 8192];

  for (const budget of budgets) {
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: opts.model ?? DEFAULT_MODEL,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userMessage },
        ],
        max_completion_tokens: budget,
      });

      const content = completion.choices[0]?.message?.content ?? "";
      const finishReason = completion.choices[0]?.finish_reason;

      if (content) return content;

      // Empty response — either token limit or refusal
      if (finishReason === "length") {
        console.warn(`[llm] Empty response, finish_reason=length, budget=${budget}. Retrying with higher budget.`);
        continue; // try next budget
      }

      console.warn(`[llm] Empty response, finish_reason=${finishReason}, budget=${budget}`);
      return ""; // non-length empty response, don't retry
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      // Retry on max_tokens errors
      if (msg.includes("max_tokens") || msg.includes("model output limit")) {
        console.warn(`[llm] Token limit error at budget=${budget}: ${msg}. Retrying.`);
        continue;
      }
      throw err;
    }
  }

  console.error("[llm] All budget attempts exhausted, returning empty");
  return "";
}

export async function analyzeWebsite(opts: {
  websiteContent: string;
  analysisPrompt: string;
}): Promise<Record<string, unknown>> {
  const completion = await getOpenAI().chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a business analyst. Analyze the provided website content and return your analysis as valid JSON only. No markdown, no explanation — just the JSON object.",
      },
      {
        role: "user",
        content: `${opts.analysisPrompt}\n\n--- WEBSITE CONTENT ---\n${opts.websiteContent.slice(0, 8000)}`,
      },
    ],
    max_completion_tokens: 500,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw);
}
