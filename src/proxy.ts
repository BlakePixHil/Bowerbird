import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/cookies";
import { accessFor } from "@/lib/auth/routes";

/**
 * The first check on every request. Without a session cookie, pages send you to sign in and API
 * routes answer 401. This only looks at the cookie; pages, actions and API routes check the session
 * itself against the database (requireMember and apiMember in src/lib/auth).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = accessFor(pathname);
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (access !== "public" && !token) {
    if (access === "api") return Response.json({ error: "Sign in first" }, { status: 401 });
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const response = NextResponse.next();
  // Keep the cookie for another 30 days while it's in use. The database session renews itself.
  if (token) response.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
  return response;
}

export const config = {
  // Everything except Next's own files and static files such as icons.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|webp|webmanifest|txt|xml)$).*)"],
};
