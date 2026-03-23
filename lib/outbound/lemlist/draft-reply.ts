/**
 * LLM Reply Drafting Module
 *
 * Takes a Lemlist reply event + company context and produces
 * an LLM-generated draft reply for Slack approval.
 */

import type { ResponseTemplate, CompanyContext, Persona } from "../config/types";
import { generateResponse } from "../llm";

/**
 * Match a reply against response templates (ordered by specificity).
 * Returns the first matching template, or the last one (catch-all).
 */
export function matchResponseTemplate(
  replyText: string,
  templates: ResponseTemplate[]
): ResponseTemplate {
  for (const template of templates) {
    const regex = new RegExp(template.trigger, "i");
    if (regex.test(replyText)) {
      return template;
    }
  }
  return templates[templates.length - 1];
}

/**
 * Find the best-matching persona based on the prospect's title.
 */
function matchPersona(title: string | null, personas: Persona[]): Persona | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (const persona of personas) {
    for (const t of persona.titles) {
      if (lower.includes(t.toLowerCase())) {
        return persona;
      }
    }
  }
  return null;
}

export interface BuildReplyPromptOpts {
  replyText: string;
  prospectName: string;
  prospectTitle: string | null;
  companyName: string;
  companyDescription: string | null;
  campaignName: string;
  originalMessage: string | null;
  repName: string;
  systemPrompt: string;
  companyContext: CompanyContext;
}

/**
 * Build a rich user prompt that includes all relevant company context
 * for the LLM to generate a contextual reply draft.
 */
export function buildReplyPrompt(opts: BuildReplyPromptOpts): string {
  const persona = matchPersona(opts.prospectTitle, opts.companyContext.personas);
  const messaging = opts.companyContext.messaging;

  const sections: string[] = [];

  sections.push(`## Prospect Information
- Name: ${opts.prospectName}
- Title: ${opts.prospectTitle || "Unknown"}
- Company: ${opts.companyName}
- Company Description: ${opts.companyDescription || "Unknown"}
- Campaign: ${opts.campaignName}`);

  sections.push(`## Their Reply
${opts.replyText}`);

  if (opts.originalMessage) {
    sections.push(`## Original Outreach Message
${opts.originalMessage}`);
  }

  if (persona) {
    sections.push(`## Persona: ${persona.name}
**Pain Points:** ${persona.pain_points.join("; ")}
**Motivations:** ${persona.motivations.join("; ")}
**Messaging Angle:** ${persona.messaging_angle}`);
  }

  sections.push(`## Company Positioning
${messaging.company.elevator_pitch}

**Tone Guidelines:** ${messaging.tone_guidelines.join(". ")}`);

  if (messaging.value_propositions.length > 0) {
    const vpList = messaging.value_propositions
      .map((vp) => `- **${vp.headline}**: ${vp.detail.trim().split("\n")[0]}`)
      .join("\n");
    sections.push(`## Value Propositions\n${vpList}`);
  }

  const refs = opts.companyContext.references;
  if (refs.length > 0) {
    const refList = refs.map((r) => `- ${r.content}`).join("\n");
    sections.push(`## Key Stats & References\n${refList}`);
  }

  const proofs = opts.companyContext.proof_points;
  if (proofs.length > 0) {
    const proofList = proofs.map((p) => `- ${p.quotable_result}`).join("\n");
    sections.push(`## Proof Points\n${proofList}`);
  }

  const replyLower = opts.replyText.toLowerCase();
  const matchedCases = opts.companyContext.use_cases.filter((uc) =>
    uc.keywords.some((kw) => replyLower.includes(kw.toLowerCase()))
  );
  if (matchedCases.length > 0) {
    const caseList = matchedCases
      .map((uc) => `- **${uc.title}**: ${uc.spring_cash_role.trim().split("\n")[0]}`)
      .join("\n");
    sections.push(`## Relevant Use Cases\n${caseList}`);
  }

  const matchedObjections = messaging.objection_handling.filter((oh) =>
    replyLower.includes(oh.objection.toLowerCase().split(" ").slice(0, 3).join(" "))
  );
  if (matchedObjections.length > 0) {
    const objList = matchedObjections
      .map((oh) => `- If they say "${oh.objection}": ${oh.response_framework.trim().split("\n")[0]}`)
      .join("\n");
    sections.push(`## Objection Handling\n${objList}`);
  }

  sections.push(`## Instructions
Draft a reply as ${opts.repName}. Follow the system prompt guidelines.`);

  return sections.join("\n\n");
}

/**
 * Generate a full LLM-powered reply draft.
 */
export async function draftReply(opts: {
  replyText: string;
  prospectName: string;
  prospectTitle: string | null;
  companyName: string;
  companyDescription: string | null;
  campaignName: string;
  originalMessage: string | null;
  repName: string;
  template: ResponseTemplate;
  companyContext: CompanyContext;
}): Promise<string> {
  const userMessage = buildReplyPrompt({
    replyText: opts.replyText,
    prospectName: opts.prospectName,
    prospectTitle: opts.prospectTitle,
    companyName: opts.companyName,
    companyDescription: opts.companyDescription,
    campaignName: opts.campaignName,
    originalMessage: opts.originalMessage,
    repName: opts.repName,
    systemPrompt: opts.template.system_prompt,
    companyContext: opts.companyContext,
  });

  return generateResponse({
    systemPrompt: opts.template.system_prompt,
    userMessage,
    maxTokens: opts.template.max_tokens,
    temperature: opts.template.temperature,
  });
}
