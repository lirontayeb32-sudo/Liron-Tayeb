/**
 * Transparent lead-priority score (0–100).
 *
 * This is a rule-based *priority* indicator that answers "who should I contact first today?".
 * It is NOT a statistically validated probability of closing. Every point is traceable to a
 * factor with a plain-Hebrew explanation, and the rules live only in this file.
 */
import { dateIL, daysBetween, todayIL } from "./dates";
import { canContact, type Lead } from "./types";

export const SCORE_DISCLAIMER =
  "ציון העדיפות מחושב לפי כללים קבועים ושקופים. הוא עוזר לסדר את היום — הוא לא הסתברות סגירה.";

export const HOT_THRESHOLD = 60;

export interface ScoreFactor {
  key: string;
  points: number;
  explanation: string;
}

export interface LeadScore {
  score: number; // 0–100
  factors: ScoreFactor[]; // sorted by absolute impact
  actionable: boolean; // false for closed / do-not-contact leads
  blockedReason: string | null;
  /** One-line "why contact now" built from the strongest positive factors. */
  summary: string;
}

export type ScoreInput = Pick<
  Lead,
  | "stage"
  | "depart_date"
  | "follow_up_date"
  | "consent"
  | "do_not_contact"
  | "booking_intent"
  | "payment_question"
  | "waiting_for_our_reply"
  | "waiting_for_quote_update"
  | "quote_sent_at"
  | "last_customer_reply_at"
  | "last_contacted_at"
  | "created_at"
>;

const STAGE_POINTS: Partial<Record<Lead["stage"], [number, string]>> = {
  READY_TO_BOOK: [15, "הלקוח בשלב ״מוכן לסגירה״"],
  QUOTED: [8, "כבר נשלחה הצעת מחיר"],
  FOLLOW_UP: [5, "הליד במעקב פעיל"],
  QUALIFYING: [4, "בשלב בירור צרכים"],
  NEW: [4, "פנייה חדשה"],
};

export function scoreLead(lead: ScoreInput, now: Date = new Date()): LeadScore {
  const today = todayIL(now);

  if (lead.stage === "WON" || lead.stage === "LOST") {
    return blocked(lead.stage === "WON" ? "העסקה נסגרה" : "הליד סומן כלא רלוונטי");
  }
  if (!canContact(lead)) {
    return blocked(
      lead.do_not_contact ? "הלקוח ביקש שלא ליצור איתו קשר" : "הלקוח סירב לקבל הודעות",
    );
  }

  const f: ScoreFactor[] = [];
  const add = (key: string, points: number, explanation: string) =>
    f.push({ key, points, explanation });

  // 1. Is the customer waiting on us?
  if (lead.waiting_for_our_reply) add("waiting_reply", 25, "הלקוח מחכה לתשובה מאיתנו");
  if (lead.waiting_for_quote_update) add("waiting_quote", 20, "הלקוח מחכה להצעה מעודכנת");

  // 2. Explicit buying signals
  if (lead.booking_intent) add("intent", 20, "הלקוח אמר במפורש שהוא רוצה להזמין");
  if (lead.payment_question) add("payment", 12, "הלקוח שאל על תשלום / תנאי תשלום");

  // 3. Pipeline stage
  const stage = STAGE_POINTS[lead.stage];
  if (stage) add("stage", stage[0], stage[1]);

  // 4. Travel date proximity
  if (lead.depart_date) {
    const d = daysBetween(today, lead.depart_date);
    if (d < 0) add("travel_date", -25, "תאריך היציאה כבר עבר — כדאי לעדכן תאריכים או לסגור את הליד");
    else if (d <= 14) add("travel_date", 15, `היציאה בעוד ${d} ימים — חלון ההחלטה קצר`);
    else if (d <= 30) add("travel_date", 12, `היציאה בעוד ${d} ימים`);
    else if (d <= 60) add("travel_date", 8, `היציאה בעוד כ-${Math.round(d / 7)} שבועות`);
    else if (d <= 120) add("travel_date", 4, `היציאה בעוד כ-${Math.round(d / 30)} חודשים`);
  }

  // 5. Engagement — how recently the customer last wrote to us
  if (lead.last_customer_reply_at) {
    const d = daysBetween(dateIL(lead.last_customer_reply_at), today);
    if (d <= 2) add("engagement", 12, d === 0 ? "הלקוח כתב לנו היום" : `הלקוח כתב לנו לפני ${d === 1 ? "יום" : "יומיים"}`);
    else if (d <= 7) add("engagement", 8, `הלקוח הגיב לפני ${d} ימים`);
    else if (d <= 14) add("engagement", 3, `הלקוח הגיב לפני ${d} ימים`);
    else if (d > 30) add("engagement", -8, `הלקוח לא הגיב כבר ${d} ימים`);
  }

  // 6. Quote sent and no reply since
  if (lead.quote_sent_at) {
    const repliedAfter =
      lead.last_customer_reply_at !== null && lead.last_customer_reply_at > lead.quote_sent_at;
    if (!repliedAfter && !lead.waiting_for_quote_update) {
      const d = daysBetween(dateIL(lead.quote_sent_at), today);
      if (d >= 2 && d <= 7) add("quote_silence", 8, `נשלחה הצעה לפני ${d} ימים ועדיין אין תגובה`);
      else if (d > 7 && d <= 21) add("quote_silence", 4, `נשלחה הצעה לפני ${d} ימים ואין תגובה`);
    }
  }

  // 7. Follow-up date due
  if (lead.follow_up_date) {
    const d = daysBetween(lead.follow_up_date, today);
    if (d === 0) add("follow_up", 10, "נקבע פולואפ להיום");
    else if (d > 0) add("follow_up", 10, `פולואפ באיחור של ${d} ימים`);
  }

  // 8. New inquiry nobody answered yet
  if (lead.stage === "NEW" && !lead.last_contacted_at) {
    const d = daysBetween(dateIL(lead.created_at), today);
    if (d <= 2) add("fresh", 12, "פנייה חדשה שעוד לא קיבלה מענה");
    else add("fresh", 6, `פנייה מלפני ${d} ימים שעוד לא קיבלה מענה`);
  }

  // 9. Already contacted today and nothing new from the customer since
  if (lead.last_contacted_at && dateIL(lead.last_contacted_at) === today) {
    const repliedSince =
      lead.last_customer_reply_at !== null && lead.last_customer_reply_at > lead.last_contacted_at;
    if (!repliedSince) add("contacted_today", -30, "כבר יצרנו קשר היום");
  }

  const raw = f.reduce((sum, x) => sum + x.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  f.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const positives = f.filter((x) => x.points > 0).slice(0, 2);
  return {
    score,
    factors: f,
    actionable: true,
    blockedReason: null,
    summary: positives.length ? positives.map((x) => x.explanation).join(" · ") : "אין כרגע סיבה דחופה לפנות",
  };
}

function blocked(reason: string): LeadScore {
  return { score: 0, factors: [], actionable: false, blockedReason: reason, summary: reason };
}

/** The daily list: the N most actionable leads, highest score first. */
export function dailyPriorityList<T extends ScoreInput>(
  leads: T[],
  now: Date = new Date(),
  limit = 20,
): Array<{ lead: T; score: LeadScore }> {
  return leads
    .map((lead) => ({ lead, score: scoreLead(lead, now) }))
    .filter((x) => x.score.actionable && x.score.score > 0)
    .sort(
      (a, b) =>
        b.score.score - a.score.score ||
        a.lead.created_at.getTime() - b.lead.created_at.getTime(),
    )
    .slice(0, limit);
}
