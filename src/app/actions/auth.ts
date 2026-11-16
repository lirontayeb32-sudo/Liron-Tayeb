"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, login, logout } from "@/lib/auth";
import { adminSql } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import { fieldErrors, formToObject, loginSchema } from "@/lib/schemas";

export interface FormState {
  ok?: boolean;
  error?: string;
  fields?: Record<string, string>;
  message?: string;
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "נא למלא אימייל וסיסמה", fields: fieldErrors(parsed.error) };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const result = await login(parsed.data.email, parsed.data.password, ip);
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `הסיסמה החדשה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` };
  }
  const sql = adminSql();
  const [row] = await sql<Array<{ password_hash: string }>>`
    select password_hash from app_users where id = ${user.id}`;
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return { error: "הסיסמה הנוכחית שגויה" };
  }
  const hash = await hashPassword(next);
  // Bumping session_version signs out every existing session, including this one.
  await sql`update app_users set password_hash = ${hash}, session_version = session_version + 1
            where id = ${user.id}`;
  await logout();
  redirect("/login?changed=1");
}
