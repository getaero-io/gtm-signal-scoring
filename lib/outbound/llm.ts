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
  const completion = await getOpenAI().chat.completions.create({
    model: opts.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
    max_completion_tokens: opts.maxTokens ?? 300,
  });

  return completion.choices[0]?.message?.content ?? "";
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
