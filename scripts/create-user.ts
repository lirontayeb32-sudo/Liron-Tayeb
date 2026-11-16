/**
 * Creates (or resets the password of) an app user.
 *   npm run user:create -- owner@example.com "שם מלא" [owner|agent]
 * The password is read from the USER_PASSWORD env var, or prompted for (hidden).
 */
import { createInterface } from "node:readline";
import postgres from "postgres";
import { hashPassword } from "../src/lib/password";
import { loadEnv } from "./env";

loadEnv();

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const [email, name, role = "owner"] = process.argv.slice(2);
  if (!email || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["owner", "agent"].includes(role)) {
    console.error('Usage: npm run user:create -- <email> "<full name>" [owner|agent]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const password = process.env.USER_PASSWORD || (await prompt("Password (min 10 chars): "));
  const hash = await hashPassword(password);
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [existing] = await sql`select id from app_users where lower(email) = ${email.toLowerCase()}`;
    if (existing) {
      await sql`update app_users set name = ${name}, role = ${role}::user_role, password_hash = ${hash},
                active = true, session_version = session_version + 1 where id = ${existing.id}`;
      console.log(`updated user ${email} (${role}) — existing sessions were signed out`);
    } else {
      await sql`insert into app_users (email, name, role, password_hash)
                values (${email.toLowerCase()}, ${name}, ${role}::user_role, ${hash})`;
      console.log(`created user ${email} (${role})`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
