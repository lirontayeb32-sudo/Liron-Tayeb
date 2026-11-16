import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { hashPassword } from "../src/lib/password";

export const E2E_USER = { email: "owner@example.test", password: "e2e-password-123", name: "נועה בעלים" };

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("Set E2E_DATABASE_URL to a disposable test database");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("E2E_DATABASE_URL must point at a *test* database");
  const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });
  try {
    await sql.unsafe("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
    const dir = path.join(process.cwd(), "supabase", "migrations");
    for (const f of readdirSync(dir).sort()) await sql.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await sql`insert into app_users (email, name, role, password_hash)
              values (${E2E_USER.email}, ${E2E_USER.name}, 'owner', ${await hashPassword(E2E_USER.password)})`;
  } finally {
    await sql.end();
  }
}
