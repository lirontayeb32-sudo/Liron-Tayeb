/**
 * Database integration tests: RLS, duplicate detection, audit trail, booking rules.
 * Needs a disposable PostgreSQL database:
 *   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/tchelet_test npm run test:integration
 * The schema is dropped and recreated — never point this at real data.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("database", () => {
  let admin: ReturnType<typeof postgres>;
  let db: typeof import("@/lib/db");
  let owner: string;
  let agent: string;
  let inactive: string;

  beforeAll(async () => {
    if (!/test/i.test(new URL(url!).pathname)) throw new Error("TEST_DATABASE_URL must point at a *test* database");
    admin = postgres(url!, { max: 1, onnotice: () => {}, prepare: false });
    await admin.unsafe("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
    const dir = path.join(process.cwd(), "supabase", "migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    const users = await admin`
      insert into app_users (email, name, password_hash, role, active) values
        ('owner@example.test', 'Owner', 'x', 'owner', true),
        ('agent@example.test', 'Agent', 'x', 'agent', true),
        ('gone@example.test', 'Gone', 'x', 'agent', false)
      returning id, email`;
    owner = users.find((u) => u.email.startsWith("owner"))!.id;
    agent = users.find((u) => u.email.startsWith("agent"))!.id;
    inactive = users.find((u) => u.email.startsWith("gone"))!.id;
    process.env.DATABASE_URL = url;
    db = await import("@/lib/db");
  });

  afterAll(async () => {
    await db?.closeDb();
    await admin?.end();
  });

  it("lets an active user create and read leads", async () => {
    const id = await db.withUser(agent, async (tx) => {
      const [row] = await tx`insert into leads (full_name, phone_e164) values ('בדיקה אחת', '+972525550001') returning id`;
      return row.id as string;
    });
    const rows = await db.withUser(owner, (tx) => tx`select full_name from leads where id = ${id}`);
    expect(rows[0].full_name).toBe("בדיקה אחת");
  });

  it("RLS: deactivated or unknown users see nothing and cannot write", async () => {
    for (const who of [inactive, "00000000-0000-4000-8000-000000000000"]) {
      const rows = await db.withUser(who, (tx) => tx`select * from leads`);
      expect(rows).toHaveLength(0);
      await expect(
        db.withUser(who, (tx) => tx`insert into leads (full_name) values ('חדירה')`),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("RLS: the app role without a bound user sees nothing", async () => {
    const rows = await admin.begin(async (tx) => {
      await tx`set local role tchelet_app`;
      return tx`select * from leads`;
    });
    expect(rows).toHaveLength(0);
  });

  it("the app role cannot read password hashes or login attempts, or alter users", async () => {
    await expect(db.withUser(owner, (tx) => tx`select password_hash from app_users`)).rejects.toThrow(/permission denied/);
    expect(await db.withUser(owner, (tx) => tx`select id, name from app_users`)).toHaveLength(3);
    await expect(db.withUser(owner, (tx) => tx`select * from login_attempts`)).rejects.toThrow(/permission denied/);
    await expect(db.withUser(owner, (tx) => tx`update app_users set role = 'owner'`)).rejects.toThrow(/permission denied/);
  });

  it("rejects a second lead with the same normalized phone", async () => {
    await expect(
      db.withUser(agent, (tx) => tx`insert into leads (full_name, phone_e164) values ('כפיל', '+972525550001')`),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("audit trail: records who changed what, and is append-only", async () => {
    const [lead] = await db.withUser(agent, (tx) => tx`select id from leads where phone_e164 = '+972525550001'`);
    await db.withUser(owner, (tx) => tx`update leads set stage = 'QUOTED', destination = 'רומא' where id = ${lead.id}`);
    const events = await db.withUser(owner, (tx) => tx`select type, user_id, changes from lead_events where lead_id = ${lead.id} order by id`);
    expect(events.map((e) => e.type)).toEqual(["lead_created", "lead_updated"]);
    expect(events[0].user_id).toBe(agent);
    expect(events[1].user_id).toBe(owner);
    expect(events[1].changes).toEqual({
      stage: { from: "NEW", to: "QUOTED" },
      destination: { from: null, to: "רומא" },
    });
    // no-op update writes no event
    await db.withUser(owner, (tx) => tx`update leads set destination = 'רומא' where id = ${lead.id}`);
    const [{ n }] = await db.withUser(owner, (tx) => tx`select count(*)::int as n from lead_events where lead_id = ${lead.id}`);
    expect(n).toBe(2);
    await expect(db.withUser(owner, (tx) => tx`delete from lead_events`)).rejects.toThrow(/permission denied/);
    await expect(db.withUser(owner, (tx) => tx`update lead_events set body = 'x'`)).rejects.toThrow(/permission denied/);
  });

  it("only the owner can delete a lead; deletion is audited", async () => {
    const [lead] = await db.withUser(agent, (tx) => tx`insert into leads (full_name) values ('למחיקה') returning id`);
    const byAgent = await db.withUser(agent, (tx) => tx`delete from leads where id = ${lead.id}`);
    expect(byAgent.count).toBe(0);
    const byOwner = await db.withUser(owner, (tx) => tx`delete from leads where id = ${lead.id}`);
    expect(byOwner.count).toBe(1);
    const [ev] = await db.withUser(owner, (tx) => tx`select type from lead_events where lead_id = ${lead.id} order by id desc limit 1`);
    expect(ev.type).toBe("lead_deleted");
  });

  it("bookings: profit is derived, confirmation needs a close date, leads with bookings are kept", async () => {
    const [lead] = await db.withUser(agent, (tx) => tx`select id from leads where phone_e164 = '+972525550001'`);
    const [b] = await db.withUser(agent, (tx) => tx`
      insert into bookings (lead_id, supplier_cost, selling_price) values (${lead.id}, 5000, 5600)
      returning id, status, expected_profit, actual_profit_received`);
    expect(b.status).toBe("pending");
    expect(Number(b.expected_profit)).toBe(600);
    expect(b.actual_profit_received).toBeNull();
    await expect(
      db.withUser(agent, (tx) => tx`update bookings set status = 'confirmed' where id = ${b.id}`),
    ).rejects.toMatchObject({ code: "23514" });
    await db.withUser(agent, (tx) => tx`update bookings set status = 'confirmed', closed_at = current_date where id = ${b.id}`);
    await expect(db.withUser(owner, (tx) => tx`delete from leads where id = ${lead.id}`)).rejects.toMatchObject({ code: "23503" });
    const events = await db.withUser(owner, (tx) => tx`select type from lead_events where lead_id = ${lead.id} and type like 'booking%' order by id`);
    expect(events.map((e) => e.type)).toEqual(["booking_created", "booking_updated"]);
  });

  it("rejects invalid data at the database level", async () => {
    const bad = [
      `insert into leads (full_name) values ('  ')`,
      `insert into leads (full_name, passengers) values ('א', 0)`,
      `insert into leads (full_name, depart_date, return_date) values ('א', '2027-02-10', '2027-02-01')`,
      `insert into leads (full_name, stage) values ('א', 'MAYBE')`,
    ];
    for (const q of bad) {
      await expect(db.withUser(agent, (tx) => tx.unsafe(q)), q).rejects.toThrow();
    }
  });
});
