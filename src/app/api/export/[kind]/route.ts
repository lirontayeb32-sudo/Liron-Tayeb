import { getUser } from "@/lib/auth";
import { todayIL } from "@/lib/dates";
import { withUser } from "@/lib/db";

/** Owner-only CSV export (UTF-8 with BOM so Excel shows Hebrew correctly). */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection from user-entered text.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,]*$/.test(s) && !/^\+\d+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const LEAD_COLUMNS = ["id", "full_name", "phone_e164", "email", "destination", "depart_date", "return_date", "dates_note", "passengers", "budget_amount", "budget_currency", "stage", "source", "notes", "follow_up_date", "consent", "do_not_contact", "booking_intent", "payment_question", "waiting_for_our_reply", "waiting_for_quote_update", "quote_sent_at", "last_customer_reply_at", "last_contacted_at", "lost_reason", "created_at", "updated_at"];
const BOOKING_COLUMNS = ["id", "lead_id", "lead_name", "lead_phone", "status", "booking_reference", "supplier", "currency", "selling_price", "supplier_cost", "expected_profit", "actual_profit_received", "follow_up_source", "closed_at", "confirmed_at", "notes", "created_at"];

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "owner") return new Response("Forbidden", { status: 403 });
  const { kind } = await params;

  let body: string;
  if (kind === "leads") {
    const rows = await withUser(user.id, (tx) => tx`select * from leads order by created_at`);
    body = toCsv(rows, LEAD_COLUMNS);
  } else if (kind === "bookings") {
    const rows = await withUser(user.id, (tx) =>
      tx`select b.*, l.full_name as lead_name, l.phone_e164 as lead_phone
         from bookings b join leads l on l.id = b.lead_id order by b.created_at`);
    body = toCsv(rows, BOOKING_COLUMNS);
  } else {
    return new Response("Not found", { status: 404 });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tchelet-${kind}-${todayIL()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
