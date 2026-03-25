import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/outbound/config/loader";
import { verifyApiAuth } from "@/lib/outbound/auth";

export async function GET(req: NextRequest) {
  const authError = verifyApiAuth(req);
  if (authError) return authError;

  try {
    const config = loadConfig();
    return NextResponse.json({ faqs: config.company_context.faqs });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load FAQs", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
