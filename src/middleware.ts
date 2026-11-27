import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorized, UNAUTHORIZED_HEADERS } from './lib/auth-gate';

export function middleware(req: NextRequest) {
  if (isAuthorized(req.headers.get('authorization'))) return NextResponse.next();
  return new NextResponse('Authentication required', { status: 401, headers: UNAUTHORIZED_HEADERS });
}

export const config = {
  // Excluded: health check (Railway), OAuth callback (protected by its state cookie), static assets, the
  // streaming upload route (middleware would buffer large bodies; that route checks the gate itself), and the PC
  // helper / sync endpoints (machine-to-machine, each checks SYNC_TOKEN itself and some stream large bodies).
  matcher: ['/((?!api/health|api/youtube/callback|api/upload|api/helper/|api/sync/projects/|_next/static|_next/image|favicon.ico).*)'],
};
