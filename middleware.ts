import { NextRequest, NextResponse } from 'next/server';

// Routes that handle their own authentication
const PUBLIC_ROUTES = [
  '/api/outbound/lemlist/webhook',
  '/api/outbound/slack/interactions',
  '/api/outbound/slack/events',
  '/api/inbound',
  '/api/outbound/health',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip routes that have their own auth
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  const internalApiKey = process.env.INTERNAL_API_KEY;

  // Dev convenience: if no key is configured, allow all requests
  if (!internalApiKey) {
    return NextResponse.next();
  }

  const providedKey = req.headers.get('x-api-key');

  if (providedKey !== internalApiKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
