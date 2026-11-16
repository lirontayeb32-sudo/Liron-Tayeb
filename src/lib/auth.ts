/**
 * Authentication & sessions.
 * - Accounts are created by the owner from the command line (`npm run user:create`); there is
 *   no public sign-up.
 * - Session = signed JWT (HS256) in an httpOnly, SameSite=Lax cookie. Every request re-checks
 *   the user row (active flag + session_version), so disabling a user or changing a password
 *   revokes existing sessions immediately.
 * - Failed logins are rate limited per e-mail and per IP.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { adminSql, isUuid } from "./db";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "tchelet_session";
const SESSION_DAYS = 14;
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "agent";
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function readSessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!isUuid(payload.sub) || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}

/** Current user or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const rows = await adminSql()<
    Array<SessionUser & { session_version: number; active: boolean }>
  >`select id, email, name, role, session_version, active from app_users where id = ${session.userId}`;
  const u = rows[0];
  if (!u || !u.active || u.session_version !== session.sessionVersion) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
});

/** For pages: redirects to /login when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function login(email: string, password: string, ip: string | null): Promise<LoginResult> {
  const sql = adminSql();
  const normalized = email.trim().toLowerCase();

  const [{ failures }] = await sql<Array<{ failures: number }>>`
    select count(*)::int as failures from login_attempts
    where not success
      and created_at > now() - make_interval(mins => ${WINDOW_MINUTES})
      and (lower(email) = ${normalized} or (${ip}::text is not null and ip = ${ip}))`;
  if (failures >= MAX_FAILURES) {
    return { ok: false, error: `יותר מדי ניסיונות כניסה. נסו שוב בעוד ${WINDOW_MINUTES} דקות.` };
  }

  const rows = await sql<
    Array<{ id: string; password_hash: string; active: boolean; session_version: number }>
  >`select id, password_hash, active, session_version from app_users where lower(email) = ${normalized}`;
  const user = rows[0];
  // Verify against a dummy hash when the user doesn't exist to keep timing uniform.
  const hash =
    user?.password_hash ??
    "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const valid = await verifyPassword(password, hash);
  const success = Boolean(user && user.active && valid);

  await sql`insert into login_attempts (email, ip, success) values (${normalized}, ${ip}, ${success})`;
  if (!success || !user) return { ok: false, error: "אימייל או סיסמה שגויים" };

  const token = await signSession(user.id, user.session_version);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
