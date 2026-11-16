"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todayIL } from "@/lib/dates";
import { isUuid, withUser } from "@/lib/db";
import { bookingSchema, fieldErrors, formToObject } from "@/lib/schemas";
import type { BookingStatus } from "@/lib/types";
import type { FormState } from "./auth";

export async function saveBookingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const leadId = form.get("lead_id");
  const bookingId = form.get("id");
  if (!isUuid(leadId)) return { error: "ליד לא תקין" };
  const parsed = bookingSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "יש שדות שדורשים תיקון", fields: fieldErrors(parsed.error) };
  const v = parsed.data;

  // A booking only counts once it is explicitly confirmed; the close date is set then.
  const closedAt = v.status === "confirmed" ? (v.closed_at ?? todayIL()) : v.closed_at;
  const cols = {
    status: v.status,
    booking_reference: v.booking_reference,
    supplier: v.supplier ?? "Sky360",
    currency: v.currency,
    supplier_cost: v.supplier_cost,
    selling_price: v.selling_price,
    actual_profit_received: v.actual_profit_received,
    follow_up_source: v.follow_up_source,
    closed_at: closedAt,
    notes: v.notes,
  };

  const result = await withUser(user.id, async (tx) => {
    const [lead] = await tx`select id from leads where id = ${leadId} for update`;
    if (!lead) return "הליד לא נמצא";
    if (isUuid(bookingId)) {
      const [before] = await tx<Array<{ status: BookingStatus }>>`
        select status from bookings where id = ${bookingId} and lead_id = ${leadId} for update`;
      if (!before) return "ההזמנה לא נמצאה";
      const newlyConfirmed = v.status === "confirmed" && before.status !== "confirmed";
      await tx`update bookings set ${tx(cols)}
               ${newlyConfirmed ? tx`, confirmed_at = now()` : v.status !== "confirmed" ? tx`, confirmed_at = null` : tx``}
               where id = ${bookingId}`;
    } else {
      await tx`insert into bookings ${tx({ ...cols, lead_id: leadId, created_by: user.id })}`;
      if (v.status === "confirmed") {
        await tx`update bookings set confirmed_at = now() where lead_id = ${leadId} and status = 'confirmed' and confirmed_at is null`;
      }
    }
    // A confirmed booking is what makes a lead WON — never the other way round.
    if (v.status === "confirmed") {
      await tx`update leads set stage = 'WON', waiting_for_our_reply = false, waiting_for_quote_update = false,
               follow_up_date = null where id = ${leadId} and stage <> 'WON'`;
    }
    return null;
  });
  if (result) return { error: result };
  revalidatePath("/", "layout");
  // Back to the lead with a visible confirmation next to the bookings list.
  redirect(`/leads/${leadId}?saved=${v.status === "confirmed" ? "confirmed" : "booking"}#bookings`);
}
