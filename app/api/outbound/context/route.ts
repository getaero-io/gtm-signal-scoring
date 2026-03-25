import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/outbound/config/loader";
import { verifyApiAuth } from "@/lib/outbound/auth";

export async function GET(req: NextRequest) {
  const authError = verifyApiAuth(req);
  if (authError) return authError;

  try {
    const config = loadConfig();
    return NextResponse.json(config.company_context);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load company context", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
