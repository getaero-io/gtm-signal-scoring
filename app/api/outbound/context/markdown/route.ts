import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/outbound/config/loader";
import { verifyApiAuth } from "@/lib/outbound/auth";
import type { CompanyContext } from "@/lib/outbound/config/types";

function renderMarkdown(ctx: CompanyContext): string {
  const lines: string[] = [];
  const msg = ctx.messaging;

  lines.push(`# ${msg.company.name}`);
  lines.push(`> ${msg.company.tagline}\n`);
  lines.push(msg.company.elevator_pitch.trim());
  lines.push("");

  // Value Propositions
  if (msg.value_propositions.length > 0) {
    lines.push("## Value Propositions\n");
    for (const vp of msg.value_propositions) {
      lines.push(`### ${vp.headline}`);
      lines.push(vp.detail.trim());
      lines.push(`*When to use:* ${vp.when_to_use}\n`);
    }
  }

  // Personas
  if (ctx.personas.length > 0) {
    lines.push("## Personas\n");
    for (const p of ctx.personas) {
      lines.push(`### ${p.name}`);
      lines.push(`**Titles:** ${p.titles.join(", ")}`);
      lines.push(`**Pain Points:** ${p.pain_points.join("; ")}`);
      lines.push(`**Motivations:** ${p.motivations.join("; ")}`);
      lines.push(`**Messaging Angle:** ${p.messaging_angle}\n`);
    }
  }

  // Use Cases
  if (ctx.use_cases.length > 0) {
    lines.push("## Use Cases\n");
    for (const uc of ctx.use_cases) {
      lines.push(`### ${uc.title}`);
      lines.push(uc.scenario.trim());
      lines.push(`\n**Our Role:** ${uc.spring_cash_role.trim()}\n`);
    }
  }

  // Proof Points
  if (ctx.proof_points.length > 0) {
    lines.push("## Proof Points\n");
    for (const p of ctx.proof_points) {
      lines.push(`- **${p.name}** (${p.category}): ${p.quotable_result}`);
    }
    lines.push("");
  }

  // References
  if (ctx.references.length > 0) {
    lines.push("## Key References\n");
    for (const r of ctx.references) {
      lines.push(`- **${r.name}** (${r.type}): ${r.content}`);
    }
    lines.push("");
  }

  // Objection Handling
  if (msg.objection_handling.length > 0) {
    lines.push("## Objection Handling\n");
    for (const oh of msg.objection_handling) {
      lines.push(`**"${oh.objection}"**`);
      lines.push(`${oh.response_framework.trim()}\n`);
    }
  }

  // Tone Guidelines
  if (msg.tone_guidelines.length > 0) {
    lines.push("## Tone Guidelines\n");
    for (const t of msg.tone_guidelines) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  // FAQs
  if (ctx.faqs?.length > 0) {
    lines.push("## Frequently Asked Questions\n");
    for (const faq of ctx.faqs) {
      lines.push(`**Q: ${faq.question}**`);
      lines.push(`A: ${faq.answer.trim()}\n`);
    }
  }

  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const authError = verifyApiAuth(req);
  if (authError) return authError;

  try {
    const config = loadConfig();
    const markdown = renderMarkdown(config.company_context);
    return new NextResponse(markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to render company context", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
