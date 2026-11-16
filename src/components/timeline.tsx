import { formatDateTime } from "@/lib/dates";
import type { LeadEvent } from "@/lib/queries";
import { BOOKING_STATUS_LABELS, CONSENT_LABELS, STAGE_LABELS } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  full_name: "שם", phone_e164: "טלפון", email: "אימייל", destination: "יעד", depart_date: "תאריך יציאה",
  return_date: "תאריך חזרה", dates_note: "הערת תאריכים", passengers: "נוסעים", budget_amount: "תקציב",
  budget_currency: "מטבע", stage: "שלב", source: "מקור", notes: "הערות", follow_up_date: "פולואפ",
  consent: "הסכמה", do_not_contact: "לא ליצור קשר", booking_intent: "רוצה להזמין", payment_question: "שאל על תשלום",
  waiting_for_our_reply: "מחכה לתשובה", waiting_for_quote_update: "מחכה להצעה מעודכנת", quote_sent_at: "הצעה נשלחה",
  last_customer_reply_at: "תגובת לקוח אחרונה", last_contacted_at: "קשר אחרון", lost_reason: "סיבת אובדן",
  status: "סטטוס הזמנה", booking_reference: "אסמכתא", supplier_cost: "עלות ספק", selling_price: "מחיר ללקוח",
  expected_profit: "רווח צפוי", actual_profit_received: "רווח בפועל", closed_at: "תאריך סגירה", currency: "מטבע",
  follow_up_source: "מקור סגירה", supplier: "ספק", confirmed_at: "אושרה",
};
const HIDDEN = new Set(["phone_raw", "booking_id", "import_batch_id", "created_by", "message_id", "channel", "edited", "confirmed_claims"]);
const TYPE_LABELS: Record<string, string> = {
  lead_created: "הליד נוצר", lead_updated: "עדכון ליד", note: "הערה", booking_created: "הזמנה נוצרה",
  booking_updated: "עדכון הזמנה", message_approved: "הודעה אושרה", message_sent: "הודעה סומנה כנשלחה",
};

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "ריק";
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (key === "stage") return STAGE_LABELS[v as keyof typeof STAGE_LABELS] ?? String(v);
  if (key === "consent") return CONSENT_LABELS[v as keyof typeof CONSENT_LABELS] ?? String(v);
  if (key === "status") return BOOKING_STATUS_LABELS[v as keyof typeof BOOKING_STATUS_LABELS] ?? String(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

function describe(e: LeadEvent): string[] {
  if (!e.changes || e.type === "lead_created" || e.type.startsWith("message_")) return [];
  return Object.entries(e.changes)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, v]) => {
      const label = FIELD_LABELS[k] ?? k;
      if (v && typeof v === "object" && "to" in (v as object)) {
        const c = v as { from: unknown; to: unknown };
        return `${label}: ${show(k, c.from)} ← ${show(k, c.to)}`;
      }
      return `${label}: ${show(k, v)}`;
    });
}

export function Timeline({ events }: { events: LeadEvent[] }) {
  if (!events.length) return <p className="text-sm text-slate-600">אין עדיין פעילות.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const lines = describe(e);
        return (
          <li key={e.id} className="border-r-2 border-slate-200 pr-3">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold">{TYPE_LABELS[e.type] ?? e.type}</span>
              <span className="text-xs text-slate-500">{formatDateTime(e.created_at)}{e.user_name ? ` · ${e.user_name}` : ""}</span>
            </div>
            {e.body ? <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-800">{e.body}</p> : null}
            {lines.length ? (
              <ul className="mt-0.5 space-y-0.5 text-sm text-slate-600">
                {lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
