import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const publicPaths = [
    '/',
    '/api/auth/login',  // Explicitly list auth endpoints
    '/favicon.ico',
    '/public',
    '/api/payments/callback',
    '/api/payments/initiate'
  ];

  // Check if the current path is public
  if (publicPaths.some(path => request.nextUrl.pathname === path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('internal-auth-token');

  if (!token) {
    // For API routes, return JSON response
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    // For page routes, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Verify JWT token
    await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    return NextResponse.next();
  } catch (error) {
    // For API routes, return JSON response
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    // For page routes, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  // Update matcher to include API routes but exclude specific paths
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - *.svg (svg files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|.*\\.svg).*)',
    '/api/:path*'  // Include all API routes
  ]
};
