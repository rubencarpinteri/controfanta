import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that do not require authentication.
// /api/cron/* is reached by external cron callers (GitHub Actions) that
// authenticate with a Bearer token validated inside each route handler.
const PUBLIC_PATHS = ['/login', '/signup', '/reset-password', '/auth', '/api/cron', '/join', '/font-playground']
const PUBLIC_EXACT = new Set<string>(['/'])

export async function middleware(request: NextRequest) {
  // Build a mutable response that we may modify for cookie forwarding
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          // Mutate the request cookies for downstream use
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // Rebuild the response so set-cookie headers are forwarded to the browser
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // IMPORTANT: getUser() — not getSession() — validates the JWT against the
  // Supabase Auth server and refreshes the token if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicPath =
    PUBLIC_EXACT.has(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // Unauthenticated user trying to access a protected route
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Authenticated user trying to access login page
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  /*
   * Run on all routes except:
   * - Next.js internal routes (_next/static, _next/image)
   * - Static file extensions
   * - favicon
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
