/**
 * Seeds SYNTHETIC demo leads so the system can be tried before importing real data.
 * All names and phone numbers are made up (05X-555-01XX range).
 *   npm run db:seed-demo            → adds demo data
 *   npm run db:seed-demo -- --clear → removes the demo data again
 * Refuses to run in production unless ALLOW_DEMO_SEED=1.
 */
import postgres from "postgres";
import { addDays, todayIL } from "../src/lib/dates";
import { loadEnv } from "./env";

loadEnv();
const SOURCE = "דמו";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo data in production (set ALLOW_DEMO_SEED=1 to override)");
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (process.argv.includes("--clear")) {
      await sql`delete from bookings where lead_id in (select id from leads where source = ${SOURCE})`;
      const res = await sql`delete from leads where source = ${SOURCE}`;
      console.log(`removed ${res.count} demo leads`);
      return;
    }
    const [owner] = await sql`select id from app_users where role = 'owner' order by created_at limit 1`;
    if (!owner) throw new Error("Create a user first: npm run user:create");
    const today = todayIL();
    const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
    const d = (n: number) => addDays(today, n);

    type Row = Record<string, string | number | boolean | Date | null>;
    const base: Row = { source: SOURCE, created_by: owner.id, budget_currency: "ILS" };
    const leads: Row[] = [
      { full_name: "דנה דוגמא", phone: "0525550101", destination: "רומא", depart_date: d(21), return_date: d(26), passengers: 2, budget_amount: 9000, stage: "READY_TO_BOOK", booking_intent: true, payment_question: true, last_customer_reply_at: ago(0, 3), quote_sent_at: ago(3), last_contacted_at: ago(1), created_at: ago(9) },
      { full_name: "יוסי בדיקה", phone: "0525550102", destination: "אתונה", depart_date: d(40), return_date: d(45), passengers: 4, budget_amount: 14000, stage: "QUOTED", waiting_for_quote_update: true, quote_sent_at: ago(4), last_customer_reply_at: ago(1), last_contacted_at: ago(4), created_at: ago(12) },
      { full_name: "מיכל ניסיון", phone: "0525550103", destination: "פריז", depart_date: d(12), return_date: d(16), passengers: 2, stage: "QUALIFYING", waiting_for_our_reply: true, last_customer_reply_at: ago(0, 6), last_contacted_at: ago(2), created_at: ago(3) },
      { full_name: "אבי לדוגמה", phone: "0525550104", destination: "דובאי", depart_date: d(55), passengers: 5, budget_amount: 22000, stage: "QUOTED", quote_sent_at: ago(5), last_contacted_at: ago(5), follow_up_date: d(0), created_at: ago(15) },
      { full_name: "נועה טסט", phone: "0525550105", destination: "ברצלונה", stage: "NEW", created_at: ago(0, 2) },
      { full_name: "רון הדגמה", phone: "0525550106", stage: "NEW", notes: "השאיר פרטים באתר, לא ציין יעד", created_at: ago(1) },
      { full_name: "שירה מבחן", phone: "0525550107", destination: "לונדון", depart_date: d(90), return_date: d(96), passengers: 3, stage: "FOLLOW_UP", follow_up_date: d(-2), last_contacted_at: ago(8), last_customer_reply_at: ago(9), created_at: ago(25) },
      { full_name: "עומר סימולציה", phone: "0525550108", destination: "תאילנד", depart_date: d(150), passengers: 2, budget_amount: 18000, stage: "FOLLOW_UP", follow_up_date: d(6), last_contacted_at: ago(4), created_at: ago(30) },
      { full_name: "טל פיקטיבי", phone: "0525550109", destination: "רומא", depart_date: d(33), passengers: 2, stage: "QUOTED", quote_sent_at: ago(2), last_contacted_at: ago(2), created_at: ago(6) },
      { full_name: "גלית מדומה", phone: "0525550110", destination: "אתונה", stage: "FOLLOW_UP", do_not_contact: true, consent: "denied", last_contacted_at: ago(20), created_at: ago(40) },
      { full_name: "אלון תרגול", phone: "0525550111", destination: "פראג", depart_date: d(-10), passengers: 2, stage: "LOST", lost_reason: "הזמין במקום אחר", created_at: ago(50) },
      { full_name: "הילה ניסוי", phone: "0525550112", destination: "רודוס", depart_date: d(70), return_date: d(75), passengers: 4, budget_amount: 12000, stage: "WON", last_contacted_at: ago(6), created_at: ago(35) },
      { full_name: "בן אילוסטרציה", phone: "0525550113", destination: "ניו יורק", depart_date: d(110), passengers: 2, budget_amount: 30000, stage: "READY_TO_BOOK", last_customer_reply_at: ago(2), quote_sent_at: ago(6), last_contacted_at: ago(2), created_at: ago(18) },
    ];

    let inserted = 0;
    for (const l of leads) {
      const { phone, ...rest } = l;
      const e164 = "+972" + String(phone).slice(1);
      const res = await sql`insert into leads ${sql({ ...base, ...rest, phone_raw: phone, phone_e164: e164 })}
                            on conflict (phone_e164) do nothing`;
      inserted += res.count;
    }
    const [won] = await sql`select id from leads where phone_e164 = '+972525550112'`;
    const [pending] = await sql`select id from leads where phone_e164 = '+972525550113'`;
    if (won && !(await sql`select 1 from bookings where lead_id = ${won.id}`).length) {
      await sql`insert into bookings (lead_id, status, booking_reference, supplier_cost, selling_price, actual_profit_received, follow_up_source, closed_at, confirmed_at, created_by)
                values (${won.id}, 'confirmed', 'DEMO-1001', 10400, 11900, 1500, 'whatsapp_followup', ${d(-6)}, now(), ${owner.id})`;
    }
    if (pending && !(await sql`select 1 from bookings where lead_id = ${pending.id}`).length) {
      await sql`insert into bookings (lead_id, status, supplier_cost, selling_price, created_by)
                values (${pending.id}, 'pending', 26500, 29000, ${owner.id})`;
    }
    console.log(`inserted ${inserted} synthetic demo leads (source = "${SOURCE}")`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
