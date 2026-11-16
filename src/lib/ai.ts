/**
 * Optional AI rewrite of a follow-up draft (Claude).
 *
 * Disabled unless ANTHROPIC_API_KEY is set — the app is fully functional without it and
 * incurs no API cost by default. The model only rephrases; scenario, reason, next action and
 * follow-up date always come from the deterministic engine. Output that trips a guardrail
 * (price, discount, urgency, availability) is discarded and the template is used instead.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { firstName, type FollowupLead, type FollowupSuggestion } from "./followup";
import { blockingIssues, MAX_MESSAGE_LENGTH } from "./guardrails";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const Output = z.object({ message: z.string() });

const SYSTEM = `אתה עוזר לסוכן נסיעות ישראלי לנסח הודעת פולואפ קצרה בוואטסאפ ללקוח.

הסוכן יקרא, יערוך ויאשר את ההודעה לפני שישלח אותה בעצמו. המטרה היא הודעה שנשמעת כמו אדם אמיתי שכותב ללקוח שלו: עברית ישראלית טבעית, חמה, קצרה ומקצועית. שתיים–שלוש שורות, לכל היותר אימוג׳י אחד.

המערכת לא מחוברת למערכת ההזמנות של הספק, ולכן אין לך שום מידע מאומת על מחירים, הנחות, זמינות טיסות או מקומות. בגלל זה ההודעה לא כוללת מחירים, סכומים, מטבעות, הנחות, מבצעים, הטבות, טענות על זמינות או מקומות פנויים, ולא יוצרת דחיפות ("מקומות אחרונים", "רק היום", "המחיר יעלה"). אם המידע הזה נחוץ, הסוכן יוסיף אותו בעצמו אחרי שבדק.

השתמש רק בעובדות שמופיעות בנתוני הליד. אל תמציא פרטים על הלקוח, על הטיול או על שיחות קודמות.
נסח בלי פנייה מגדרית (למשל "מתאים לך", "נוח לך") ובלי צורות הווה מגדריות בגוף ראשון, כי מין הלקוח והסוכן אינו ידוע.
שמור על אותה כוונה כמו בטיוטה שתקבל — רק שפר את הניסוח והתאם אותו אישית.`;

export async function rewriteWithAI(
  lead: FollowupLead,
  base: FollowupSuggestion,
  ctx: { agencyName: string; agentName: string },
): Promise<{ message: string; usedAI: boolean; fallbackReason?: string }> {
  if (!aiEnabled()) return { message: base.message, usedAI: false, fallbackReason: "AI לא מופעל" };

  const facts = {
    customer_first_name: firstName(lead.full_name),
    destination: lead.destination,
    depart_date: lead.depart_date,
    return_date: lead.return_date,
    passengers: lead.passengers,
    stage: lead.stage,
    customer_waiting_for_our_reply: lead.waiting_for_our_reply,
    customer_waiting_for_updated_quote: lead.waiting_for_quote_update,
    customer_said_they_want_to_book: lead.booking_intent,
    customer_asked_about_payment: lead.payment_question,
    agent_name: ctx.agentName,
    agency_name: ctx.agencyName,
  };

  try {
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
    const response = await client.beta.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `נתוני הליד:\n${JSON.stringify(facts, null, 2)}\n\nמה צריך לקרות עכשיו: ${base.suggestedAction}\nלמה: ${base.reason}\n\nטיוטה קיימת:\n${base.message}\n\nנסח גרסה משופרת של ההודעה.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { message: base.message, usedAI: false, fallbackReason: "המודל סירב לנסח" };
    }
    const text = response.parsed_output?.message?.trim();
    if (!text) return { message: base.message, usedAI: false, fallbackReason: "לא התקבל ניסוח" };
    if (text.length > MAX_MESSAGE_LENGTH || blockingIssues(text).length > 0) {
      return {
        message: base.message,
        usedAI: false,
        fallbackReason: "הניסוח של ה-AI נפסל בבדיקת התוכן (מחיר / הנחה / דחיפות / זמינות)",
      };
    }
    return { message: text, usedAI: true };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { message: base.message, usedAI: false, fallbackReason: "עומס זמני בשירות ה-AI" };
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return { message: base.message, usedAI: false, fallbackReason: "מפתח ה-AI אינו תקין" };
    }
    if (error instanceof Anthropic.APIError) {
      return { message: base.message, usedAI: false, fallbackReason: "שירות ה-AI לא זמין כרגע" };
    }
    throw error;
  }
}
