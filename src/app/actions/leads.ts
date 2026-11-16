"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isUuid, withUser } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { fieldErrors, formToObject, leadSchema, type LeadInput } from "@/lib/schemas";
import { STAGES, type Stage } from "@/lib/types";
import type { FormState } from "./auth";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

function columns(v: LeadInput) {
  const phone = v.phone ? normalizePhone(v.phone) : null;
  const dnc = v.do_not_contact || v.consent === "denied";
  return {
    full_name: v.full_name,
    phone_raw: v.phone,
    phone_e164: phone && phone.ok ? phone.e164 : null,
    email: v.email,
    destination: v.destination,
    depart_date: v.depart_date,
    return_date: v.return_date,
    dates_note: v.dates_note,
    passengers: v.passengers,
    budget_amount: v.budget_amount,
    budget_currency: v.budget_currency,
    stage: v.stage,
    source: v.source,
    notes: v.notes,
    follow_up_date: v.follow_up_date,
    consent: v.consent,
    do_not_contact: dnc,
    booking_intent: v.booking_intent,
    payment_question: v.payment_question,
    waiting_for_our_reply: v.waiting_for_our_reply,
    waiting_for_quote_update: v.waiting_for_quote_update,
    lost_reason: v.stage === "LOST" ? v.lost_reason : null,
  };
}

export async function saveLeadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = form.get("id");
  const parsed = leadSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "יש שדות שדורשים תיקון", fields: fieldErrors(parsed.error) };
  const cols = columns(parsed.data);

  let leadId: string;
  try {
    leadId = await withUser(user.id, async (tx) => {
      if (isUuid(id)) {
        const [before] = await tx<Array<{ stage: Stage }>>`select stage from leads where id = ${id} for update`;
        if (!before) throw new Error("NOT_FOUND");
        const quoted = cols.stage === "QUOTED" && before.stage !== "QUOTED";
        await tx`update leads set ${tx(cols)} ${quoted ? tx`, quote_sent_at = now()` : tx``} where id = ${id}`;
        return id;
      }
      const [row] = await tx<Array<{ id: string }>>`
        insert into leads ${tx({ ...cols, created_by: user.id })}
        returning id`;
      if (cols.stage === "QUOTED") await tx`update leads set quote_sent_at = now() where id = ${row.id}`;
      return row.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { error: "כבר קיים ליד עם מספר הטלפון הזה", fields: { phone: "מספר הטלפון כבר קיים במערכת" } };
    }
    if (e instanceof Error && e.message === "NOT_FOUND") return { error: "הליד לא נמצא" };
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/leads/${leadId}`);
}

const QUICK_ACTIONS = [
  "sent_quote",
  "customer_replied",
  "contacted",
  "waiting_reply_on",
  "waiting_reply_off",
  "waiting_quote_on",
  "waiting_quote_off",
  "intent_on",
  "intent_off",
  "payment_on",
  "payment_off",
  "opt_out",
] as const;
type QuickAction = (typeof QUICK_ACTIONS)[number];

/** One-tap updates from the lead page. Each is a plain form post. */
export async function quickAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  const action = form.get("action") as QuickAction;
  if (!isUuid(id) || !QUICK_ACTIONS.includes(action)) return;

  await withUser(user.id, async (tx) => {
    switch (action) {
      case "sent_quote":
        await tx`update leads set stage = 'QUOTED', quote_sent_at = now(), last_contacted_at = now(),
                 waiting_for_quote_update = false, waiting_for_our_reply = false
                 where id = ${id} and stage not in ('WON','LOST')`;
        break;
      case "customer_replied":
        await tx`update leads set last_customer_reply_at = now() where id = ${id}`;
        break;
      case "contacted":
        await tx`update leads set last_contacted_at = now(), waiting_for_our_reply = false,
                 stage = case when stage = 'NEW' then 'QUALIFYING'::lead_stage else stage end
                 where id = ${id}`;
        break;
      case "waiting_reply_on":
        await tx`update leads set waiting_for_our_reply = true, last_customer_reply_at = now() where id = ${id}`;
        break;
      case "waiting_reply_off":
        await tx`update leads set waiting_for_our_reply = false where id = ${id}`;
        break;
      case "waiting_quote_on":
        await tx`update leads set waiting_for_quote_update = true, last_customer_reply_at = now() where id = ${id}`;
        break;
      case "waiting_quote_off":
        await tx`update leads set waiting_for_quote_update = false where id = ${id}`;
        break;
      case "intent_on":
        await tx`update leads set booking_intent = true, last_customer_reply_at = now() where id = ${id}`;
        break;
      case "intent_off":
        await tx`update leads set booking_intent = false where id = ${id}`;
        break;
      case "payment_on":
        await tx`update leads set payment_question = true, last_customer_reply_at = now() where id = ${id}`;
        break;
      case "payment_off":
        await tx`update leads set payment_question = false where id = ${id}`;
        break;
      case "opt_out":
        await tx`update leads set do_not_contact = true, consent = 'denied' where id = ${id}`;
        await tx`update followup_messages set status = 'discarded'
                 where lead_id = ${id} and status in ('draft','approved')`;
        break;
    }
  });
  revalidatePath("/", "layout");
}

export async function setStageAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  const stage = String(form.get("stage")) as Stage;
  if (!isUuid(id) || !STAGES.includes(stage)) return;
  await withUser(user.id, async (tx) => {
    await tx`update leads set stage = ${stage}::lead_stage,
             quote_sent_at = case when ${stage} = 'QUOTED' and stage <> 'QUOTED' then now() else quote_sent_at end
             where id = ${id}`;
  });
  revalidatePath("/", "layout");
}

export async function setFollowUpDateAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  const date = String(form.get("follow_up_date") ?? "");
  if (!isUuid(id) || (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return;
  await withUser(user.id, (tx) => tx`update leads set follow_up_date = ${date || null} where id = ${id}`);
  revalidatePath("/", "layout");
}

export async function addNoteAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  const body = String(form.get("body") ?? "").trim().slice(0, 4000);
  if (!isUuid(id) || !body) return;
  await withUser(user.id, async (tx) => {
    const [lead] = await tx`select 1 from leads where id = ${id}`;
    if (!lead) return;
    await tx`insert into lead_events (lead_id, user_id, type, body) values (${id}, ${user.id}, 'note', ${body})`;
  });
  revalidatePath(`/leads/${id}`);
}

export async function deleteLeadAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = form.get("id");
  if (!isUuid(id) || user.role !== "owner") return;
  try {
    await withUser(user.id, (tx) => tx`delete from leads where id = ${id}`);
  } catch (e) {
    // FK from bookings: a lead with bookings is kept for the financial record.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23503") {
      redirect(`/leads/${id}?error=has_bookings`);
    }
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/leads");
}
