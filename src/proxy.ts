import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Fast gate: anything except the login page requires a validly signed session cookie.
 * The authoritative check (user still active, session not revoked) happens again in
 * requireUser() on every page and server action.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("tchelet_session")?.value;
  let valid = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { algorithms: ["HS256"] });
      valid = true;
    } catch {
      valid = false;
    }
  }
  if (pathname === "/login") {
    return valid ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!valid) {
    if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|apple-icon.png|manifest.webmanifest|favicon.ico).*)"],
};
