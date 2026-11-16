"use server";

import { revalidatePath } from "next/cache";
import { rewriteWithAI } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { isUuid, withUser } from "@/lib/db";
import { ContactBlockedError, generateFollowup } from "@/lib/followup";
import { blockingIssues, MAX_MESSAGE_LENGTH, type GuardrailIssue } from "@/lib/guardrails";
import { canContact, type FollowupMessage, type Lead } from "@/lib/types";

export interface DraftResult {
  ok: boolean;
  error?: string;
  notice?: string;
  issues?: GuardrailIssue[];
}

const agency = () => process.env.AGENCY_NAME || "תכלת תיירות";

/** Creates a new draft for the lead (replacing any open draft). Nothing is sent. */
export async function generateDraftAction(leadId: string, variant: number, useAI: boolean): Promise<DraftResult> {
  const user = await requireUser();
  if (!isUuid(leadId)) return { ok: false, error: "ליד לא תקין" };
  const lead = await withUser(user.id, async (tx) => (await tx<Lead[]>`select * from leads where id = ${leadId}`)[0]);
  if (!lead) return { ok: false, error: "הליד לא נמצא" };

  const ctx = { agencyName: agency(), agentName: user.name.split(" ")[0] };
  let suggestion;
  try {
    suggestion = generateFollowup(lead, { ...ctx, variant: Number.isInteger(variant) ? variant : 0 });
  } catch (e) {
    if (e instanceof ContactBlockedError) return { ok: false, error: e.message };
    throw e;
  }

  let body = suggestion.message;
  let generator: "template" | "ai" = "template";
  let notice: string | undefined;
  if (useAI) {
    const ai = await rewriteWithAI(lead, suggestion, ctx);
    if (ai.usedAI) {
      body = ai.message;
      generator = "ai";
    } else {
      notice = `נשארנו עם הניסוח הרגיל: ${ai.fallbackReason}`;
    }
  }

  await withUser(user.id, async (tx) => {
    await tx`update followup_messages set status = 'discarded' where lead_id = ${leadId} and status in ('draft','approved')`;
    await tx`insert into followup_messages
      (lead_id, body, scenario, suggested_action, reason, next_follow_up, generator, created_by)
      values (${leadId}, ${body}, ${suggestion.scenario}, ${suggestion.suggestedAction},
              ${suggestion.reason}, ${suggestion.nextFollowUp}, ${generator}, ${user.id})`;
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, notice };
}

/**
 * Owner approval. The (possibly edited) text is re-checked on the server; text that mentions
 * a price, discount, urgency or availability needs an explicit "I verified this" confirmation.
 */
export async function approveMessageAction(messageId: string, body: string, confirmedVerified: boolean): Promise<DraftResult> {
  const user = await requireUser();
  if (!isUuid(messageId)) return { ok: false, error: "הודעה לא תקינה" };
  const text = body.trim();
  if (!text) return { ok: false, error: "ההודעה ריקה" };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `ההודעה ארוכה מדי (עד ${MAX_MESSAGE_LENGTH} תווים)` };
  const issues = blockingIssues(text);
  if (issues.length && !confirmedVerified) {
    return { ok: false, issues, error: "יש בהודעה פרטים שדורשים אימות לפני אישור" };
  }

  const result = await withUser(user.id, async (tx) => {
    const [row] = await tx<Array<FollowupMessage & Pick<Lead, "do_not_contact" | "consent">>>`
      select m.*, l.do_not_contact, l.consent from followup_messages m join leads l on l.id = m.lead_id
      where m.id = ${messageId} for update of m`;
    if (!row) return { ok: false, error: "ההודעה לא נמצאה" };
    if (!canContact(row)) return { ok: false, error: "הלקוח ביקש שלא ליצור איתו קשר" };
    if (row.status !== "draft" && row.status !== "approved") return { ok: false, error: "ההודעה כבר טופלה" };
    await tx`update followup_messages set body = ${text}, status = 'approved', approved_by = ${user.id}, approved_at = now()
             where id = ${messageId}`;
    await tx`insert into lead_events (lead_id, user_id, type, body, changes)
             values (${row.lead_id}, ${user.id}, 'message_approved', ${text},
                     ${tx.json({ message_id: messageId, edited: text !== row.body, confirmed_claims: issues.map((i) => i.rule) })})`;
    return { ok: true, leadId: row.lead_id };
  });
  if (result.ok && "leadId" in result) revalidatePath(`/leads/${result.leadId}`);
  return { ok: result.ok, error: "error" in result ? result.error : undefined };
}

/** Back to editing (un-approve). */
export async function reopenMessageAction(messageId: string): Promise<DraftResult> {
  const user = await requireUser();
  if (!isUuid(messageId)) return { ok: false };
  const leadId = await withUser(user.id, async (tx) => {
    const [row] = await tx<Array<{ lead_id: string }>>`
      update followup_messages set status = 'draft', approved_by = null, approved_at = null
      where id = ${messageId} and status = 'approved' returning lead_id`;
    return row?.lead_id;
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return { ok: Boolean(leadId) };
}

/**
 * The owner sent the message themselves (WhatsApp / copy-paste) and records it here.
 * Updates last contact, schedules the next follow-up and logs it in the audit trail.
 */
export async function markSentAction(messageId: string): Promise<DraftResult> {
  const user = await requireUser();
  if (!isUuid(messageId)) return { ok: false };
  const result = await withUser(user.id, async (tx) => {
    const [row] = await tx<FollowupMessage[]>`select * from followup_messages where id = ${messageId} for update`;
    if (!row) return { ok: false, error: "ההודעה לא נמצאה" };
    if (row.status !== "approved") return { ok: false, error: "אפשר לסמן כנשלחה רק הודעה שאושרה" };
    await tx`update followup_messages set status = 'sent_manually', marked_sent_at = now() where id = ${messageId}`;
    await tx`update leads set last_contacted_at = now(),
               follow_up_date = ${row.next_follow_up},
               stage = case when stage = 'NEW' then 'QUALIFYING'::lead_stage else stage end
             where id = ${row.lead_id}`;
    await tx`insert into lead_events (lead_id, user_id, type, body, changes)
             values (${row.lead_id}, ${user.id}, 'message_sent', ${row.body}, ${tx.json({ message_id: messageId, channel: "manual" })})`;
    return { ok: true, leadId: row.lead_id };
  });
  if (result.ok) revalidatePath("/", "layout");
  return { ok: result.ok, error: "error" in result ? result.error : undefined };
}
