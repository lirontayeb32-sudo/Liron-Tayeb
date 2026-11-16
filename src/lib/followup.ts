/**
 * Follow-up engine (deterministic, free, no external calls).
 *
 * For a lead it produces: a short WhatsApp draft, the suggested next action, the reason for
 * the recommendation and the best next follow-up date. Drafts only use facts stored on the
 * lead (name, destination) — never prices, discounts, availability or urgency.
 * Hebrew phrasing avoids gendered forms so the same text suits every customer.
 */
import { addDays, dateIL, daysBetween, nextBusinessDay, todayIL } from "./dates";
import { blockingIssues } from "./guardrails";
import { canContact, type Lead } from "./types";

export type Scenario =
  | "waiting_reply"
  | "waiting_quote"
  | "ready_to_book"
  | "payment"
  | "quoted_no_reply"
  | "new_inquiry"
  | "qualifying"
  | "check_in";

export interface FollowupSuggestion {
  scenario: Scenario;
  message: string;
  suggestedAction: string;
  reason: string;
  nextFollowUp: string; // YYYY-MM-DD
  variantCount: number;
}

export interface FollowupContext {
  agencyName: string;
  agentName: string;
  now?: Date;
  variant?: number;
}

export type FollowupLead = Pick<
  Lead,
  | "full_name"
  | "destination"
  | "depart_date"
  | "return_date"
  | "passengers"
  | "budget_amount"
  | "stage"
  | "consent"
  | "do_not_contact"
  | "booking_intent"
  | "payment_question"
  | "waiting_for_our_reply"
  | "waiting_for_quote_update"
  | "quote_sent_at"
  | "last_customer_reply_at"
  | "last_contacted_at"
>;

export class ContactBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactBlockedError";
  }
}

export function firstName(fullName: string): string {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  return cleaned.split(" ")[0] || cleaned;
}

export function pickScenario(lead: FollowupLead): Scenario {
  if (lead.waiting_for_our_reply) return "waiting_reply";
  if (lead.waiting_for_quote_update) return "waiting_quote";
  if (lead.stage === "READY_TO_BOOK" || lead.booking_intent) return "ready_to_book";
  if (lead.payment_question) return "payment";
  if (lead.stage === "QUOTED") return "quoted_no_reply";
  if (lead.stage === "NEW") return "new_inquiry";
  if (lead.stage === "QUALIFYING") return "qualifying";
  return "check_in";
}

/** What we still need to know to prepare a quote, phrased as one natural question. */
export function missingInfoQuestion(lead: FollowupLead): string | null {
  const missing: string[] = [];
  if (!lead.destination) missing.push("לאן חשבת לטוס");
  if (!lead.depart_date) missing.push("באילו תאריכים");
  if (!lead.passengers) missing.push("כמה נוסעים");
  if (!lead.budget_amount) missing.push("מה התקציב בערך");
  if (!missing.length) return null;
  const last = missing.pop()!;
  const list = missing.length ? `${missing.join(", ")} ו${last}` : last;
  return `אפשר לכתוב לי ${list}?`;
}

interface Built {
  variants: string[];
  suggestedAction: string;
  reason: string;
  followUpInDays: number;
}

function build(scenario: Scenario, lead: FollowupLead, ctx: FollowupContext, today: string): Built {
  const name = firstName(lead.full_name);
  const hi = `היי ${name}, ${ctx.agentName} מ${ctx.agencyName} 🙂`;
  const dest = lead.destination?.trim();
  const trip = dest ? `החופשה ל${dest}` : "החופשה";
  const offer = dest ? `ההצעה ל${dest}` : "ההצעה";
  const ask = missingInfoQuestion(lead);

  switch (scenario) {
    case "waiting_reply":
      return {
        variants: [
          `${hi}\nלא שכחתי אותך — אני על זה, ואחזור אליך עם תשובה מסודרת לגבי ${trip}.`,
          `${hi}\nרק לעדכן שהשאלה שלך לגבי ${trip} אצלי בטיפול. אחזור אליך עם תשובה ברגע שיהיו לי כל הפרטים.`,
        ],
        suggestedAction: "לענות ללקוח על השאלה הפתוחה — עוד היום",
        reason: "הלקוח מחכה לתשובה מאיתנו. כל יום בלי מענה מקטין את הסיכוי שיישאר איתנו.",
        followUpInDays: 0,
      };
    case "waiting_quote":
      return {
        variants: [
          `${hi}\nההצעה המעודכנת ל${dest ? dest : "חופשה"} בהכנה, ואשלח לך אותה ברגע שהיא מוכנה. יש עוד משהו שחשוב לך שאתחשב בו?`,
          `${hi}\nעדכון קצר: ${offer} בעדכון ותגיע אליך בהקדם. אם השתנה משהו בתאריכים או בהרכב — זה הזמן לספר לי.`,
        ],
        suggestedAction: "להפיק הצעה מעודכנת ב-Sky360 ולשלוח ללקוח",
        reason: "הלקוח ביקש הצעה מעודכנת ועדיין לא קיבל אותה.",
        followUpInDays: 0,
      };
    case "ready_to_book":
      return {
        variants: [
          `${hi}\nרציתי לוודא שיש לך את כל מה שצריך כדי לסגור את ${trip}. נשאר משהו פתוח שאפשר לעזור בו?`,
          `${hi}\nמבחינתי אפשר להתקדם עם ${trip} מתי שנוח לך. יש שאלה אחרונה לפני שסוגרים?`,
        ],
        suggestedAction: "להתקשר או לשלוח הודעה ולסגור את ההזמנה",
        reason: lead.booking_intent
          ? "הלקוח אמר במפורש שהוא רוצה להזמין — נשאר רק ללוות אותו לסגירה."
          : "הליד בשלב ״מוכן לסגירה״ — זו העסקה הקרובה ביותר להכנסה.",
        followUpInDays: 1,
      };
    case "payment":
      return {
        variants: [
          `${hi}\nלגבי התשלום על ${trip} — אשמח להסביר בדיוק איך זה עובד ולענות על כל שאלה. מתי נוח לך שנדבר?`,
          `${hi}\nראיתי את השאלה שלך על התשלום. אפשר לעבור על האפשרויות יחד בשיחה קצרה — מתי מתאים לך?`,
        ],
        suggestedAction: "להסביר את אפשרויות התשלום (לאחר בדיקה מול הספק) ולהציע שיחה",
        reason: "שאלה על תשלום היא סימן קנייה חזק — הלקוח כבר חושב על הסגירה.",
        followUpInDays: 1,
      };
    case "quoted_no_reply":
      return {
        variants: [
          `${hi}\nרציתי לוודא ש${offer} הגיעה אליך, ואם יש שאלות או משהו שכדאי להתאים — אני כאן.`,
          `${hi}\nמה דעתך על ${offer}? אם משהו לא מדויק — תאריכים, מלון, הרכב — אשמח להתאים.`,
        ],
        suggestedAction: "לבדוק שההצעה התקבלה ולהציע התאמות",
        reason: quoteReason(lead, today),
        followUpInDays: 2,
      };
    case "new_inquiry":
      return {
        variants: [
          `${hi}\nתודה על הפנייה${dest ? ` לגבי ${dest}` : ""}! כדי שאוכל להתאים לך הצעה טובה — ${ask ?? "מתי נוח לך שנדבר כמה דקות?"}`,
          `${hi}\nקיבלתי את הפנייה שלך${dest ? ` לגבי ${dest}` : ""} ואשמח לעזור. ${ask ?? "מתי נוח לך לשיחה קצרה?"}`,
        ],
        suggestedAction: ask ? "להשלים פרטים חסרים ולהעביר לבירור צרכים" : "ליצור קשר ראשון ולהכין הצעה",
        reason: "פנייה חדשה — מענה מהיר הוא הגורם הכי משמעותי בשלב הזה.",
        followUpInDays: 1,
      };
    case "qualifying":
      return {
        variants: [
          `${hi}\nכדי להכין לך הצעה מדויקת ל${dest ? dest : "חופשה"} — ${ask ?? "יש משהו שחשוב לך במיוחד (מלון, שעות טיסה, כבודה)?"}`,
          `${hi}\nהתחלתי לבנות לך הצעה. ${ask ?? "יש העדפות מיוחדות שכדאי שאדע עליהן?"}`,
        ],
        suggestedAction: ask ? "להשלים את הפרטים החסרים" : "להכין הצעת מחיר ב-Sky360 ולשלוח",
        reason: ask
          ? "חסרים פרטים בסיסיים — בלעדיהם אי אפשר להפיק הצעה."
          : "כל הפרטים קיימים — אפשר להפיק הצעה.",
        followUpInDays: 1,
      };
    default:
      return {
        variants: [
          `${hi}\nחשבתי עליך בהקשר של ${trip} — זה עדיין רלוונטי? אם כן, אשמח לעדכן לך הצעה. ואם לא, הכול בסדר גמור.`,
          `${hi}\nרציתי לבדוק מה קורה עם ${trip}. אם התוכניות השתנו — אין בעיה, רק שאדע איך לעזור.`,
        ],
        suggestedAction: "לבדוק אם הליד עדיין רלוונטי ולעדכן שלב בהתאם",
        reason: "עבר זמן מאז הקשר האחרון — בדיקה קצרה ומכבדת שומרת את הליד חי בלי ללחוץ.",
        followUpInDays: 5,
      };
  }
}

function quoteReason(lead: FollowupLead, today: string): string {
  if (lead.quote_sent_at) {
    const d = daysBetween(dateIL(lead.quote_sent_at), today);
    if (d >= 1) return `ההצעה נשלחה לפני ${d} ימים ועדיין אין תגובה — בדיקה קצרה מחזירה את השיחה.`;
  }
  return "נשלחה הצעה ואין עדיין תגובה — כדאי לוודא שהתקבלה.";
}

export function generateFollowup(lead: FollowupLead, ctx: FollowupContext): FollowupSuggestion {
  if (!canContact(lead)) {
    throw new ContactBlockedError(
      lead.do_not_contact
        ? "הלקוח סומן ״לא ליצור קשר״ — לא ניתן להכין הודעה"
        : "הלקוח סירב לקבל הודעות — לא ניתן להכין הודעה",
    );
  }
  if (lead.stage === "WON" || lead.stage === "LOST") {
    throw new ContactBlockedError("הליד סגור — אין צורך בפולואפ מכירתי");
  }
  const today = todayIL(ctx.now);
  const scenario = pickScenario(lead);
  const built = build(scenario, lead, ctx, today);
  const variant = Math.abs(ctx.variant ?? 0) % built.variants.length;
  const message = built.variants[variant];

  // Templates are written to be guardrail-clean, but lead data (e.g. a destination typed as
  // "מבצע לפראג") flows into them — verify the final text rather than trust the inputs.
  const issues = blockingIssues(message);
  const safeMessage = issues.length
    ? `היי ${firstName(lead.full_name)}, ${ctx.agentName} מ${ctx.agencyName} 🙂\nרציתי לבדוק איך אפשר לעזור עם החופשה. מתי נוח לך שנדבר?`
    : message;

  let next = nextBusinessDay(addDays(today, built.followUpInDays));
  if (lead.depart_date && lead.depart_date >= today && next > lead.depart_date) {
    next = lead.depart_date;
  }

  return {
    scenario,
    message: safeMessage,
    suggestedAction: built.suggestedAction,
    reason: built.reason,
    nextFollowUp: next,
    variantCount: built.variants.length,
  };
}
