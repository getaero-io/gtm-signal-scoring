/**
 * Simple bearer token auth for outbound API endpoints.
 *
 * Checks the Authorization header against the API_SECRET env var.
 * Returns null if authorized, or a 401 NextResponse if not.
 */

import { NextRequest, NextResponse } from "next/server";

export function verifyApiAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;
  if (!secret) {
    // If no secret is configured, endpoints are open (dev mode)
    return null;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  return null;
}
