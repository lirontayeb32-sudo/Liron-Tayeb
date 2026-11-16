/** Zod validation for everything that crosses the client → server boundary. */
import { z } from "zod";
import { isValidISODate } from "./dates";
import { normalizePhone } from "./phone";
import { BOOKING_STATUSES, CONSENTS, CURRENCIES, FOLLOW_UP_SOURCES, STAGES } from "./types";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `עד ${max} תווים`).nullable().default(null));

const optDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .refine(isValidISODate, "תאריך לא תקין")
    .nullable()
    .default(null),
);

const optMoney = z.preprocess(
  (v) => (typeof v === "string" ? emptyToNull(v.replace(/[,\s₪$€]/g, "")) : v),
  z.coerce
    .number({ message: "סכום לא תקין" })
    .min(0, "סכום לא יכול להיות שלילי")
    .max(99_999_999, "סכום גבוה מדי")
    .nullable()
    .default(null),
);

const money = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[,\s₪$€]/g, "") : v),
  z.coerce.number({ message: "סכום לא תקין" }).min(0, "סכום לא יכול להיות שלילי").max(99_999_999),
);

const bool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

export const leadSchema = z
  .object({
    full_name: z.string().trim().min(1, "חובה למלא שם").max(120),
    phone: optText(40),
    email: z.preprocess(emptyToNull, z.email("אימייל לא תקין").max(200).nullable().default(null)),
    destination: optText(120),
    depart_date: optDate,
    return_date: optDate,
    dates_note: optText(200),
    passengers: z.preprocess(
      emptyToNull,
      z.coerce.number().int("מספר שלם").min(1).max(500).nullable().default(null),
    ),
    budget_amount: optMoney,
    budget_currency: z.enum(CURRENCIES).default("ILS"),
    stage: z.enum(STAGES).default("NEW"),
    source: optText(80),
    notes: optText(5000),
    follow_up_date: optDate,
    consent: z.enum(CONSENTS).default("unknown"),
    do_not_contact: bool.default(false),
    booking_intent: bool.default(false),
    payment_question: bool.default(false),
    waiting_for_our_reply: bool.default(false),
    waiting_for_quote_update: bool.default(false),
    lost_reason: optText(300),
  })
  .superRefine((v, ctx) => {
    if (v.depart_date && v.return_date && v.return_date < v.depart_date) {
      ctx.addIssue({ code: "custom", path: ["return_date"], message: "תאריך החזרה לפני תאריך היציאה" });
    }
    if (v.phone) {
      const p = normalizePhone(v.phone);
      if (!p.ok) ctx.addIssue({ code: "custom", path: ["phone"], message: p.reason });
    }
  });
export type LeadInput = z.infer<typeof leadSchema>;

export const bookingSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES).default("pending"),
    booking_reference: optText(80),
    supplier: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().default(null)),
    currency: z.enum(CURRENCIES).default("ILS"),
    supplier_cost: money,
    selling_price: money,
    actual_profit_received: z.preprocess(
      (v) => (typeof v === "string" ? emptyToNull(v.replace(/[,\s₪$€]/g, "")) : v),
      z.coerce.number({ message: "סכום לא תקין" }).min(-99_999_999).max(99_999_999).nullable().default(null),
    ),
    follow_up_source: z.preprocess(emptyToNull, z.enum(FOLLOW_UP_SOURCES).nullable().default(null)),
    closed_at: optDate,
    notes: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "confirmed" && !v.booking_reference) {
      ctx.addIssue({
        code: "custom",
        path: ["booking_reference"],
        message: "כדי לסמן הזמנה כמאושרת חובה להזין מספר אסמכתא מהספק",
      });
    }
  });
export type BookingInput = z.infer<typeof bookingSchema>;

export const loginSchema = z.object({
  email: z.email("אימייל לא תקין").max(200),
  password: z.string().min(1, "חובה להזין סיסמה").max(200),
});

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
