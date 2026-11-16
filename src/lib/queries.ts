/** Read-side queries. Everything runs through withUser → RLS applies. */
import "server-only";
import { addDays, todayIL } from "./dates";
import { withUser, type Tx } from "./db";
import { HOT_THRESHOLD, scoreLead, type LeadScore } from "./scoring";
import { OPEN_STAGES, STAGES, type Booking, type FollowupMessage, type Lead, type Stage } from "./types";

export interface LeadFilters {
  q?: string;
  stage?: string;
  view?: string; // due | waiting_quote | waiting_reply | quoted | hot | dnc | open | all
  sort?: string; // score | follow_up | depart | created | name
  page?: number;
}

export const PAGE_SIZE = 30;
export type ScoredLead = Lead & { score: LeadScore };

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listLeads(userId: string, f: LeadFilters) {
  const today = todayIL();
  const now = new Date();
  const q = (f.q ?? "").trim().slice(0, 100);
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  const stage = (STAGES as readonly string[]).includes(f.stage ?? "") ? (f.stage as Stage) : null;
  const view = f.view ?? "open";

  const rows = await withUser(userId, (tx) => {
    const like = `%${escapeLike(q)}%`;
    const phoneLike = `%${digits}%`;
    return tx<Lead[]>`
      select * from leads
      where true
        ${q ? tx`and (full_name ilike ${like} or destination ilike ${like} or email ilike ${like} or notes ilike ${like}
                 ${digits.length >= 3 ? tx`or phone_e164 like ${phoneLike}` : tx``})` : tx``}
        ${stage ? tx`and stage = ${stage}` : tx``}
        ${view === "open" || view === "hot" ? tx`and stage = any(${OPEN_STAGES}::lead_stage[])` : tx``}
        ${view === "due" ? tx`and follow_up_date <= ${today} and stage = any(${OPEN_STAGES}::lead_stage[])` : tx``}
        ${view === "waiting_quote" ? tx`and waiting_for_quote_update and stage = any(${OPEN_STAGES}::lead_stage[])` : tx``}
        ${view === "waiting_reply" ? tx`and waiting_for_our_reply and stage = any(${OPEN_STAGES}::lead_stage[])` : tx``}
        ${view === "quoted" ? tx`and stage = 'QUOTED' and (last_customer_reply_at is null or last_customer_reply_at < quote_sent_at)` : tx``}
        ${view === "dnc" ? tx`and (do_not_contact or consent = 'denied')` : tx``}
      order by created_at desc
      limit 5000`;
  });

  let scored: ScoredLead[] = rows.map((l) => ({ ...l, score: scoreLead(l, now) }));
  if (view === "hot") scored = scored.filter((l) => l.score.actionable && l.score.score >= HOT_THRESHOLD);

  const far = "9999-12-31";
  const sort = f.sort ?? "score";
  const cmp: Record<string, (a: ScoredLead, b: ScoredLead) => number> = {
    score: (a, b) => b.score.score - a.score.score,
    follow_up: (a, b) => (a.follow_up_date ?? far).localeCompare(b.follow_up_date ?? far),
    depart: (a, b) => (a.depart_date ?? far).localeCompare(b.depart_date ?? far),
    created: (a, b) => b.created_at.getTime() - a.created_at.getTime(),
    name: (a, b) => a.full_name.localeCompare(b.full_name, "he"),
  };
  scored.sort(cmp[sort] ?? cmp.score);

  const total = scored.length;
  const page = Math.max(1, Math.min(f.page ?? 1, Math.max(1, Math.ceil(total / PAGE_SIZE))));
  return { leads: scored.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export interface LeadEvent {
  id: string;
  type: string;
  changes: Record<string, unknown> | null;
  body: string | null;
  created_at: Date;
  user_name: string | null;
}

export async function getLeadDetail(userId: string, leadId: string) {
  return withUser(userId, async (tx) => {
    const [lead] = await tx<Lead[]>`select * from leads where id = ${leadId}`;
    if (!lead) return null;
    const bookings = await tx<Booking[]>`select * from bookings where lead_id = ${leadId} order by created_at desc`;
    const messages = await tx<FollowupMessage[]>`
      select * from followup_messages where lead_id = ${leadId} and status <> 'discarded'
      order by created_at desc limit 10`;
    const events = await tx<LeadEvent[]>`
      select e.id::text, e.type, e.changes, e.body, e.created_at, u.name as user_name
      from lead_events e left join app_users u on u.id = e.user_id
      where e.lead_id = ${leadId} order by e.created_at desc, e.id desc limit 60`;
    return { lead, bookings, messages, events };
  });
}

export interface MoneyByCurrency {
  currency: string;
  amount: number;
}

export interface Dashboard {
  today: string;
  newToday: number;
  newWeek: number;
  hotCount: number;
  followUpsDue: number;
  quotesAwaiting: number;
  waitingQuoteUpdate: ScoredLead[];
  waitingOurReply: number;
  priority: ScoredLead[];
  closest: ScoredLead[];
  bookingsWonMonth: number;
  pendingBookings: number;
  wonWithoutBooking: number;
  profitMonth: MoneyByCurrency[];
  profitAll: MoneyByCurrency[];
  expectedProfitPending: MoneyByCurrency[];
  conversion: { total: number; booked: number; rate: number | null };
  destinations: Array<{ destination: string; count: number }>;
}

async function openLeads(tx: Tx) {
  return tx<Lead[]>`select * from leads where stage = any(${OPEN_STAGES}::lead_stage[]) limit 10000`;
}

export async function getDashboard(userId: string): Promise<Dashboard> {
  const now = new Date();
  const today = todayIL(now);
  const monthStart = today.slice(0, 8) + "01";
  const weekAgo = addDays(today, -6);

  return withUser(userId, async (tx) => {
    const leads = await openLeads(tx);
    const scored: ScoredLead[] = leads.map((l) => ({ ...l, score: scoreLead(l, now) }));
    const actionable = scored
      .filter((l) => l.score.actionable && l.score.score > 0)
      .sort((a, b) => b.score.score - a.score.score || a.created_at.getTime() - b.created_at.getTime());

    const [counts] = await tx<Array<{ new_today: number; new_week: number; total: number; booked: number; won_without_booking: number }>>`
      select
        count(*) filter (where (created_at at time zone 'Asia/Jerusalem')::date = ${today}::date)::int as new_today,
        count(*) filter (where (created_at at time zone 'Asia/Jerusalem')::date >= ${weekAgo}::date)::int as new_week,
        count(*)::int as total,
        count(*) filter (where exists (
          select 1 from bookings b where b.lead_id = leads.id and b.status = 'confirmed'))::int as booked,
        count(*) filter (where stage = 'WON' and not exists (
          select 1 from bookings b where b.lead_id = leads.id and b.status = 'confirmed'))::int as won_without_booking
      from leads`;

    const money = await tx<Array<{ currency: string; won_month: number; profit_month: string; profit_all: string; pending: number; expected_pending: string }>>`
      select currency,
        count(*) filter (where status = 'confirmed' and closed_at >= ${monthStart}::date)::int as won_month,
        coalesce(sum(actual_profit_received) filter (where status = 'confirmed' and closed_at >= ${monthStart}::date), 0) as profit_month,
        coalesce(sum(actual_profit_received) filter (where status = 'confirmed'), 0) as profit_all,
        count(*) filter (where status = 'pending')::int as pending,
        coalesce(sum(expected_profit) filter (where status = 'pending'), 0) as expected_pending
      from bookings group by currency order by currency`;

    const destinations = await tx<Array<{ destination: string; count: number }>>`
      select min(btrim(destination)) as destination, count(*)::int as count
      from leads where destination is not null and btrim(destination) <> ''
      group by lower(btrim(destination)) order by count desc, destination limit 6`;

    const nonZero = (rows: MoneyByCurrency[]) => rows.filter((r) => r.amount !== 0);
    return {
      today,
      newToday: counts.new_today,
      newWeek: counts.new_week,
      hotCount: actionable.filter((l) => l.score.score >= HOT_THRESHOLD).length,
      followUpsDue: scored.filter((l) => l.score.actionable && l.follow_up_date !== null && l.follow_up_date <= today).length,
      quotesAwaiting: scored.filter(
        (l) =>
          l.score.actionable &&
          l.stage === "QUOTED" &&
          (l.last_customer_reply_at === null || (l.quote_sent_at !== null && l.last_customer_reply_at < l.quote_sent_at)),
      ).length,
      waitingQuoteUpdate: actionable.filter((l) => l.waiting_for_quote_update),
      waitingOurReply: actionable.filter((l) => l.waiting_for_our_reply).length,
      priority: actionable.slice(0, 20),
      // Closest to closing is about deal state, not about today's urgency — keep leads that
      // were already contacted today (score 0) in this list.
      closest: scored
        .filter((l) => l.score.actionable && (l.stage === "READY_TO_BOOK" || l.booking_intent))
        .sort((a, b) => b.score.score - a.score.score)
        .slice(0, 8),
      bookingsWonMonth: money.reduce((s, m) => s + m.won_month, 0),
      pendingBookings: money.reduce((s, m) => s + m.pending, 0),
      wonWithoutBooking: counts.won_without_booking,
      profitMonth: nonZero(money.map((m) => ({ currency: m.currency, amount: Number(m.profit_month) }))),
      profitAll: nonZero(money.map((m) => ({ currency: m.currency, amount: Number(m.profit_all) }))),
      expectedProfitPending: nonZero(money.map((m) => ({ currency: m.currency, amount: Number(m.expected_pending) }))),
      conversion: {
        total: counts.total,
        booked: counts.booked,
        rate: counts.total > 0 ? counts.booked / counts.total : null,
      },
      destinations,
    };
  });
}

export interface BookingRow extends Booking {
  lead_name: string;
  lead_destination: string | null;
}

export interface ProfitSummaryRow {
  currency: string;
  confirmed_count: number;
  revenue: number;
  supplier_cost: number;
  expected_profit: number;
  actual_profit: number;
  missing_actual: number;
  pending_count: number;
  pending_expected: number;
}

export async function getProfit(userId: string) {
  return withUser(userId, async (tx) => {
    const bookings = await tx<BookingRow[]>`
      select b.*, l.full_name as lead_name, l.destination as lead_destination
      from bookings b join leads l on l.id = b.lead_id
      order by coalesce(b.closed_at, b.created_at::date) desc, b.created_at desc limit 500`;
    const summary = (
      await tx`
      select currency,
        count(*) filter (where status = 'confirmed')::int as confirmed_count,
        coalesce(sum(selling_price) filter (where status = 'confirmed'), 0) as revenue,
        coalesce(sum(supplier_cost) filter (where status = 'confirmed'), 0) as supplier_cost,
        coalesce(sum(expected_profit) filter (where status = 'confirmed'), 0) as expected_profit,
        coalesce(sum(actual_profit_received) filter (where status = 'confirmed'), 0) as actual_profit,
        count(*) filter (where status = 'confirmed' and actual_profit_received is null)::int as missing_actual,
        count(*) filter (where status = 'pending')::int as pending_count,
        coalesce(sum(expected_profit) filter (where status = 'pending'), 0) as pending_expected
      from bookings group by currency order by currency`
    ).map(
      (r): ProfitSummaryRow => ({
        currency: r.currency,
        confirmed_count: r.confirmed_count,
        revenue: Number(r.revenue),
        supplier_cost: Number(r.supplier_cost),
        expected_profit: Number(r.expected_profit),
        actual_profit: Number(r.actual_profit),
        missing_actual: r.missing_actual,
        pending_count: r.pending_count,
        pending_expected: Number(r.pending_expected),
      }),
    );
    const bySource = await tx<Array<{ source: string | null; currency: string; count: number; profit: string }>>`
      select follow_up_source as source, currency, count(*)::int as count,
             coalesce(sum(actual_profit_received), 0) as profit
      from bookings where status = 'confirmed'
      group by follow_up_source, currency order by count desc`;
    return { bookings, summary, bySource };
  });
}
