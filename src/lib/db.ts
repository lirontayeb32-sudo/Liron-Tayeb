/**
 * Database access.
 *
 * `withUser(userId, fn)` is the only way application code should touch business tables:
 * it opens a transaction, drops privileges to the `tchelet_app` role and binds the acting
 * user, so PostgreSQL row-level security and the audit triggers see who is acting.
 *
 * `adminSql` is the raw owner connection and is used only by the auth module
 * (looking up a user before a session exists) and by scripts.
 */
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __tcheletSql?: Sql };

function create(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // required for Supabase's transaction pooler
    onnotice: () => {},
    types: {
      // keep DATE columns as 'YYYY-MM-DD' strings (no timezone surprises)
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  });
}

export function adminSql(): Sql {
  if (!globalForDb.__tcheletSql) globalForDb.__tcheletSql = create();
  return globalForDb.__tcheletSql;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(userId)) throw new Error("withUser: invalid user id");
  return adminSql().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role tchelet_app`;
    return fn(tx);
  }) as Promise<T>;
}

export async function closeDb() {
  if (globalForDb.__tcheletSql) {
    await globalForDb.__tcheletSql.end();
    globalForDb.__tcheletSql = undefined;
  }
}
