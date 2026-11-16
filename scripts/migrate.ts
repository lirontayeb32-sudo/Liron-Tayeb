/**
 * Minimal forward-only migration runner.
 * Applies supabase/migrations/*.sql in filename order, once each.
 * Usage: npm run db:migrate   (reads DATABASE_URL from the environment / .env.local)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { loadEnv } from "./env";

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });

async function main() {
  await sql`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migrations enable row level security`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const body = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("database is up to date");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
