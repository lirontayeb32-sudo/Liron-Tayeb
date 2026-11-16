import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Loads .env.local then .env (without overriding variables that are already set). */
export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
