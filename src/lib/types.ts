export const STAGES = [
  "NEW",
  "QUALIFYING",
  "QUOTED",
  "FOLLOW_UP",
  "READY_TO_BOOK",
  "WON",
  "LOST",
] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["NEW", "QUALIFYING", "QUOTED", "FOLLOW_UP", "READY_TO_BOOK"];

export const STAGE_LABELS: Record<Stage, string> = {
  NEW: "חדש",
  QUALIFYING: "בירור צרכים",
  QUOTED: "נשלחה הצעה",
  FOLLOW_UP: "במעקב",
  READY_TO_BOOK: "מוכן לסגירה",
  WON: "נסגר",
  LOST: "לא רלוונטי",
};

export const CONSENTS = ["unknown", "granted", "denied"] as const;
export type Consent = (typeof CONSENTS)[number];
export const CONSENT_LABELS: Record<Consent, string> = {
  unknown: "לא ידוע",
  granted: "אישר/ה קבלת הודעות",
  denied: "סירב/ה לקבל הודעות",
};

export const CURRENCIES = ["ILS", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_SYMBOL: Record<Currency, string> = { ILS: "₪", USD: "$", EUR: "€" };

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "ממתין לאישור",
  confirmed: "מאושר",
  cancelled: "בוטל",
};

export const FOLLOW_UP_SOURCES = [
  "whatsapp_followup",
  "phone_call",
  "customer_returned",
  "referral",
  "other",
] as const;
export const FOLLOW_UP_SOURCE_LABELS: Record<(typeof FOLLOW_UP_SOURCES)[number], string> = {
  whatsapp_followup: "פולואפ בוואטסאפ",
  phone_call: "שיחת טלפון",
  customer_returned: "הלקוח חזר מעצמו",
  referral: "המלצה",
  other: "אחר",
};

/** A lead row as stored in the database (dates as ISO strings / Date objects). */
export interface Lead {
  id: string;
  full_name: string;
  phone_raw: string | null;
  phone_e164: string | null;
  email: string | null;
  destination: string | null;
  depart_date: string | null; // YYYY-MM-DD
  return_date: string | null;
  dates_note: string | null;
  passengers: number | null;
  budget_amount: string | null; // numeric comes back as string
  budget_currency: Currency;
  stage: Stage;
  source: string | null;
  notes: string | null;
  follow_up_date: string | null;
  consent: Consent;
  do_not_contact: boolean;
  booking_intent: boolean;
  payment_question: boolean;
  waiting_for_our_reply: boolean;
  waiting_for_quote_update: boolean;
  quote_sent_at: Date | null;
  last_customer_reply_at: Date | null;
  last_contacted_at: Date | null;
  lost_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Booking {
  id: string;
  lead_id: string;
  status: BookingStatus;
  booking_reference: string | null;
  supplier: string;
  currency: Currency;
  supplier_cost: string;
  selling_price: string;
  expected_profit: string;
  actual_profit_received: string | null;
  follow_up_source: string | null;
  closed_at: string | null;
  confirmed_at: Date | null;
  notes: string | null;
  created_at: Date;
}

export interface FollowupMessage {
  id: string;
  lead_id: string;
  body: string;
  status: "draft" | "approved" | "sent_manually" | "discarded";
  scenario: string;
  suggested_action: string;
  reason: string;
  next_follow_up: string | null;
  generator: "template" | "ai";
  approved_at: Date | null;
  marked_sent_at: Date | null;
  created_at: Date;
}

export function canContact(lead: Pick<Lead, "do_not_contact" | "consent">): boolean {
  return !lead.do_not_contact && lead.consent !== "denied";
}
