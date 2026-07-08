import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";


export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  // Create Supabase server client to read session from cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getSession() instead of getUser() in middleware to avoid flaky localhost network requests
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protect /dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const user = session.user;
    const role = user.user_metadata?.role as string | undefined;

    if (!role) {
      // Missing role causes infinite loop, force re-login or onboarding
      return NextResponse.redirect(new URL("/login?error=missing_role", request.url));
    }

    if (pathname.startsWith("/dashboard/teacher") && role !== "teacher") {
      return NextResponse.redirect(new URL("/dashboard/student", request.url));
    }

    if (pathname.startsWith("/dashboard/student") && role !== "student") {
      return NextResponse.redirect(new URL("/dashboard/teacher", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    // Refresh session on all routes to keep tokens fresh
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
