"use client";

import Link from "next/link";
import { useState } from "react";
import { saveLeadAction } from "@/app/actions/leads";
import { CONSENT_LABELS, CONSENTS, CURRENCIES, CURRENCY_SYMBOL, STAGE_LABELS, STAGES, type Lead } from "@/lib/types";
import { useServerForm } from "./use-server-form";

type Values = Partial<Pick<Lead, "id" | "full_name" | "phone_raw" | "email" | "destination" | "depart_date" | "return_date" | "dates_note" | "passengers" | "budget_amount" | "budget_currency" | "stage" | "source" | "notes" | "follow_up_date" | "consent" | "do_not_contact" | "booking_intent" | "payment_question" | "waiting_for_our_reply" | "waiting_for_quote_update" | "lost_reason">>;

export function LeadForm({ lead }: { lead?: Values }) {
  const { state, pending, onSubmit } = useServerForm(saveLeadAction);
  const [stage, setStage] = useState(lead?.stage ?? "NEW");
  const err = (name: string) =>
    state.fields?.[name] ? (
      <p id={`${name}-error`} className="mt-1 text-sm text-rose-700">{state.fields[name]}</p>
    ) : null;
  const aria = (name: string) => (state.fields?.[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});
  const check = (name: keyof Values, label: string) => (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3">
      <input type="checkbox" name={name} defaultChecked={Boolean(lead?.[name])} className="h-5 w-5 accent-brand-700" />
      <span className="text-sm">{label}</span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {lead?.id ? <input type="hidden" name="id" value={lead.id} /> : null}
      {state.error ? (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p>
      ) : null}

      <fieldset className="card space-y-3">
        <legend className="sr-only">פרטי הלקוח</legend>
        <h2 className="font-bold">פרטי הלקוח</h2>
        <div>
          <label htmlFor="full_name" className="label">שם מלא *</label>
          <input id="full_name" name="full_name" required defaultValue={lead?.full_name ?? ""} autoComplete="off" className="input" {...aria("full_name")} />
          {err("full_name")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="label">טלפון (וואטסאפ)</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={lead?.phone_raw ?? ""} placeholder="054-1234567" autoComplete="off" className="input text-left" {...aria("phone")} />
            {err("phone")}
          </div>
          <div>
            <label htmlFor="email" className="label">אימייל</label>
            <input id="email" name="email" type="email" inputMode="email" dir="ltr" defaultValue={lead?.email ?? ""} autoComplete="off" className="input text-left" {...aria("email")} />
            {err("email")}
          </div>
        </div>
        <div>
          <label htmlFor="source" className="label">מקור הפנייה</label>
          <input id="source" name="source" defaultValue={lead?.source ?? ""} placeholder="פייסבוק, המלצה, אתר…" className="input" />
        </div>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="sr-only">פרטי הנסיעה</legend>
        <h2 className="font-bold">פרטי הנסיעה</h2>
        <div>
          <label htmlFor="destination" className="label">יעד</label>
          <input id="destination" name="destination" defaultValue={lead?.destination ?? ""} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="depart_date" className="label">תאריך יציאה</label>
            <input id="depart_date" name="depart_date" type="date" defaultValue={lead?.depart_date ?? ""} className="input" {...aria("depart_date")} />
            {err("depart_date")}
          </div>
          <div>
            <label htmlFor="return_date" className="label">תאריך חזרה</label>
            <input id="return_date" name="return_date" type="date" defaultValue={lead?.return_date ?? ""} className="input" {...aria("return_date")} />
            {err("return_date")}
          </div>
        </div>
        <div>
          <label htmlFor="dates_note" className="label">הערה לתאריכים</label>
          <input id="dates_note" name="dates_note" defaultValue={lead?.dates_note ?? ""} placeholder="גמישים, חופשת פסח…" className="input" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="passengers" className="label">נוסעים</label>
            <input id="passengers" name="passengers" type="number" inputMode="numeric" min={1} max={500} defaultValue={lead?.passengers ?? ""} className="input" {...aria("passengers")} />
            {err("passengers")}
          </div>
          <div>
            <label htmlFor="budget_amount" className="label">תקציב</label>
            <input id="budget_amount" name="budget_amount" inputMode="decimal" dir="ltr" defaultValue={lead?.budget_amount ? Number(lead.budget_amount) : ""} className="input text-left" {...aria("budget_amount")} />
            {err("budget_amount")}
          </div>
          <div>
            <label htmlFor="budget_currency" className="label">מטבע</label>
            <select id="budget_currency" name="budget_currency" defaultValue={lead?.budget_currency ?? "ILS"} className="input">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{CURRENCY_SYMBOL[c]} {c}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="sr-only">מצב המכירה</legend>
        <h2 className="font-bold">מצב המכירה</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="stage" className="label">שלב</label>
            <select id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className="input">
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="follow_up_date" className="label">תאריך פולואפ</label>
            <input id="follow_up_date" name="follow_up_date" type="date" defaultValue={lead?.follow_up_date ?? ""} className="input" />
          </div>
        </div>
        {stage === "LOST" ? (
          <div>
            <label htmlFor="lost_reason" className="label">למה לא נסגר?</label>
            <input id="lost_reason" name="lost_reason" defaultValue={lead?.lost_reason ?? ""} placeholder="מחיר, הזמין במקום אחר, ביטל נסיעה…" className="input" />
          </div>
        ) : null}
        {stage === "WON" ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ליד ״נסגר״ נספר ברווח רק אחרי שמוזנת לו הזמנה מאושרת עם אסמכתא מהספק.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {check("waiting_for_our_reply", "הלקוח מחכה לתשובה מאיתנו")}
          {check("waiting_for_quote_update", "הלקוח מחכה להצעה מעודכנת")}
          {check("booking_intent", "אמר במפורש שרוצה להזמין")}
          {check("payment_question", "שאל על תשלום")}
        </div>
        <div>
          <label htmlFor="notes" className="label">הערות</label>
          <textarea id="notes" name="notes" rows={4} defaultValue={lead?.notes ?? ""} className="input" />
        </div>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="sr-only">הסכמה ויצירת קשר</legend>
        <h2 className="font-bold">הסכמה ויצירת קשר</h2>
        <div>
          <label htmlFor="consent" className="label">הסכמה לקבלת הודעות</label>
          <select id="consent" name="consent" defaultValue={lead?.consent ?? "unknown"} className="input">
            {CONSENTS.map((c) => (
              <option key={c} value={c}>{CONSENT_LABELS[c]}</option>
            ))}
          </select>
        </div>
        {check("do_not_contact", "לא ליצור קשר (הלקוח ביקש להפסיק)")}
        <p className="text-xs text-slate-500">לקוח שסומן ״לא ליצור קשר״ או שסירב לקבל הודעות לא יופיע ברשימת הפניות ולא ניתן להכין לו הודעות.</p>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={pending} aria-busy={pending}>{pending ? "שומר…" : "שמירה"}</button>
        <Link href={lead?.id ? `/leads/${lead.id}` : "/leads"} className="btn-secondary">ביטול</Link>
      </div>
    </form>
  );
}
