"use client";

import { useState } from "react";
import { saveBookingAction } from "@/app/actions/bookings";
import { formatMoney } from "@/lib/format";
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, CURRENCIES, CURRENCY_SYMBOL, FOLLOW_UP_SOURCE_LABELS, FOLLOW_UP_SOURCES, type Booking } from "@/lib/types";
import { useServerForm } from "./use-server-form";

const num = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function BookingForm({ leadId, booking }: { leadId: string; booking?: Booking }) {
  const { state, pending, onSubmit } = useServerForm(saveBookingAction);
  const [cost, setCost] = useState(booking ? String(Number(booking.supplier_cost)) : "");
  const [price, setPrice] = useState(booking ? String(Number(booking.selling_price)) : "");
  const [currency, setCurrency] = useState(booking?.currency ?? "ILS");
  const [status, setStatus] = useState(booking?.status ?? "pending");
  const c = num(cost);
  const p = num(price);
  const expected = c !== null && p !== null ? p - c : null;
  const uid = booking?.id ?? "new";
  const err = (name: string) => (state.fields?.[name] ? <p className="mt-1 text-sm text-rose-700">{state.fields[name]}</p> : null);

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="lead_id" value={leadId} />
      {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`status-${uid}`} className="label">סטטוס הזמנה</label>
          <select id={`status-${uid}`} name="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input">
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`ref-${uid}`} className="label">אסמכתא (Sky360)</label>
          <input id={`ref-${uid}`} name="booking_reference" dir="ltr" defaultValue={booking?.booking_reference ?? ""} className="input text-left" autoComplete="off" />
          {err("booking_reference")}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor={`price-${uid}`} className="label">מחיר ללקוח</label>
          <input id={`price-${uid}`} name="selling_price" inputMode="decimal" dir="ltr" required value={price} onChange={(e) => setPrice(e.target.value)} className="input text-left" />
          {err("selling_price")}
        </div>
        <div>
          <label htmlFor={`cost-${uid}`} className="label">עלות ספק</label>
          <input id={`cost-${uid}`} name="supplier_cost" inputMode="decimal" dir="ltr" required value={cost} onChange={(e) => setCost(e.target.value)} className="input text-left" />
          {err("supplier_cost")}
        </div>
        <div>
          <label htmlFor={`cur-${uid}`} className="label">מטבע</label>
          <select id={`cur-${uid}`} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)} className="input">
            {CURRENCIES.map((x) => (
              <option key={x} value={x}>{CURRENCY_SYMBOL[x]} {x}</option>
            ))}
          </select>
        </div>
      </div>
      <p className={`rounded-xl px-3 py-2 text-sm ${expected !== null && expected < 0 ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-700"}`}>
        רווח גולמי צפוי: <strong className="tabular-nums">{expected === null ? "—" : formatMoney(expected, currency)}</strong>
        {expected !== null && expected < 0 ? " — העלות גבוהה מהמחיר ללקוח" : ""}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`actual-${uid}`} className="label">רווח שהתקבל בפועל</label>
          <input id={`actual-${uid}`} name="actual_profit_received" inputMode="decimal" dir="ltr" defaultValue={booking?.actual_profit_received != null ? Number(booking.actual_profit_received) : ""} placeholder="ממלאים כשהכסף נכנס" className="input text-left placeholder:text-right" />
          {err("actual_profit_received")}
        </div>
        <div>
          <label htmlFor={`closed-${uid}`} className="label">תאריך סגירה</label>
          <input id={`closed-${uid}`} name="closed_at" type="date" defaultValue={booking?.closed_at ?? ""} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor={`src-${uid}`} className="label">מה הביא לסגירה?</label>
        <select id={`src-${uid}`} name="follow_up_source" defaultValue={booking?.follow_up_source ?? ""} className="input">
          <option value="">לא צוין</option>
          {FOLLOW_UP_SOURCES.map((s) => (
            <option key={s} value={s}>{FOLLOW_UP_SOURCE_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`bnotes-${uid}`} className="label">הערות להזמנה</label>
        <input id={`bnotes-${uid}`} name="notes" defaultValue={booking?.notes ?? ""} className="input" />
      </div>
      {status === "confirmed" ? (
        <p className="text-xs text-slate-600">״מאושר״ = ההזמנה אושרה בפועל מול הספק. רק הזמנות מאושרות נספרות בהכנסות וברווח, והליד יסומן ״נסגר״.</p>
      ) : (
        <p className="text-xs text-slate-600">הזמנה שממתינה לאישור לא נספרת בהכנסות או ברווח.</p>
      )}
      <div aria-live="polite">
        {state.error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p> : null}
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending} aria-busy={pending}>{pending ? "שומר…" : booking ? "עדכון הזמנה" : "שמירת הזמנה"}</button>
    </form>
  );
}
