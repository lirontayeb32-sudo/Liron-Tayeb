import Link from "next/link";
import { notFound } from "next/navigation";
import { addNoteAction, deleteLeadAction, quickAction, setFollowUpDateAction, setStageAction } from "@/app/actions/leads";
import { BookingForm } from "@/components/booking-form";
import { FollowupPanel } from "@/components/followup-panel";
import { SubmitButton } from "@/components/submit-button";
import { Timeline } from "@/components/timeline";
import { Notice, ScoreBadge, StagePill } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateRange, formatDateTime, relativeDays, todayIL } from "@/lib/dates";
import { isUuid } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getLeadDetail } from "@/lib/queries";
import { SCORE_DISCLAIMER, scoreLead } from "@/lib/scoring";
import { BOOKING_STATUS_LABELS, canContact, CONSENT_LABELS, STAGE_LABELS, STAGES } from "@/lib/types";

export const metadata = { title: "ליד" };

function Quick({ id, action, children, className = "btn-secondary btn-sm" }: { id: string; action: string; children: React.ReactNode; className?: string }) {
  return (
    <form action={quickAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={`${className} w-full`} pendingText="מעדכן…">{children}</SubmitButton>
    </form>
  );
}

function Toggle({ id, on, name, label }: { id: string; on: boolean; name: string; label: string }) {
  return (
    <form action={quickAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={`${name}_${on ? "off" : "on"}`} />
      <button type="submit" aria-pressed={on} className={`btn btn-sm w-full border ${on ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-300 bg-white text-slate-700"}`}>
        <span aria-hidden="true">{on ? "✓" : "＋"}</span> {label}
      </button>
    </form>
  );
}

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved } = await searchParams;
  if (!isUuid(id)) notFound();
  const detail = await getLeadDetail(user.id, id);
  if (!detail) notFound();
  const { lead, bookings, messages, events } = detail;
  const today = todayIL();
  const score = scoreLead(lead);
  const contactable = canContact(lead);
  const closed = lead.stage === "WON" || lead.stage === "LOST";
  const openMessage = messages.find((m) => m.status === "draft" || m.status === "approved") ?? null;
  const blockedReason = !contactable ? (score.blockedReason ?? "הלקוח ביקש שלא ליצור איתו קשר") : null;
  const hasConfirmed = bookings.some((b) => b.status === "confirmed");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <nav aria-label="חזרה"><Link href="/leads" className="text-sm text-brand-700">→ כל הלידים</Link></nav>

      <header className="card">
        <div className="flex items-start gap-3">
          <ScoreBadge score={score} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold break-words">{lead.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StagePill stage={lead.stage} />
              {lead.phone_e164 ? <span dir="ltr" className="text-sm text-slate-600">{formatPhone(lead.phone_e164)}</span> : <span className="text-sm text-slate-500">אין טלפון</span>}
            </div>
          </div>
          <Link href={`/leads/${lead.id}/edit`} className="btn-secondary btn-sm shrink-0">עריכה</Link>
        </div>
        {contactable && lead.phone_e164 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${lead.phone_e164}`} className="btn-secondary">חיוג</a>
            <a href={`https://wa.me/${lead.phone_e164.slice(1)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">שיחה בוואטסאפ</a>
          </div>
        ) : null}
        {score.actionable ? (
          <details className="mt-3 rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold">למה הציון {score.score}? <span className="font-normal text-slate-600">{score.summary}</span></summary>
            <ul className="mt-2 space-y-1 text-sm">
              {score.factors.map((f) => (
                <li key={f.key} className="flex justify-between gap-3">
                  <span>{f.explanation}</span>
                  <span dir="ltr" className={`shrink-0 font-semibold tabular-nums ${f.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>{f.points > 0 ? `+${f.points}` : f.points}</span>
                </li>
              ))}
              {!score.factors.length ? <li className="text-slate-600">אין כרגע גורמים שמשפיעים על הציון.</li> : null}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{SCORE_DISCLAIMER}</p>
          </details>
        ) : (
          <p className="mt-3 text-sm text-slate-600">{score.blockedReason}</p>
        )}
      </header>

      {error === "has_bookings" ? <Notice tone="error">אי אפשר למחוק ליד שיש לו הזמנות — הרשומות הכספיות נשמרות.</Notice> : null}
      {lead.stage === "WON" && !hasConfirmed ? (
        <Notice tone="warn">הליד מסומן ״נסגר״ אבל אין לו הזמנה מאושרת. כדי שייספר ברווח — הזינו הזמנה מאושרת למטה.</Notice>
      ) : null}
      {contactable && lead.consent === "unknown" ? (
        <p className="text-xs text-slate-500">לא תועדה הסכמה לדיוור. מענה לפנייה של הלקוח תקין; לפני הודעה שיווקית יזומה ודאו הסכמה.</p>
      ) : null}

      {!closed ? (
        <FollowupPanel
          leadId={lead.id}
          phone={lead.phone_e164}
          message={openMessage ? { id: openMessage.id, body: openMessage.body, status: openMessage.status, suggested_action: openMessage.suggested_action, reason: openMessage.reason, next_follow_up: openMessage.next_follow_up, generator: openMessage.generator } : null}
          blockedReason={blockedReason}
          aiEnabled={aiEnabled()}
          today={today}
        />
      ) : null}

      {!closed ? (
        <section className="card space-y-3" aria-labelledby="quick-title">
          <h2 id="quick-title" className="font-bold">עדכון מהיר</h2>
          <div className="grid grid-cols-2 gap-2">
            <Quick id={lead.id} action="customer_replied">הלקוח הגיב</Quick>
            <Quick id={lead.id} action="contacted">יצרתי קשר</Quick>
            <div className="col-span-2"><Quick id={lead.id} action="sent_quote" className="btn-primary btn-sm">שלחתי הצעת מחיר</Quick></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle id={lead.id} on={lead.waiting_for_our_reply} name="waiting_reply" label="מחכה לתשובה" />
            <Toggle id={lead.id} on={lead.waiting_for_quote_update} name="waiting_quote" label="מחכה להצעה מעודכנת" />
            <Toggle id={lead.id} on={lead.booking_intent} name="intent" label="רוצה להזמין" />
            <Toggle id={lead.id} on={lead.payment_question} name="payment" label="שאל על תשלום" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={setStageAction} className="flex items-end gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <div className="min-w-0 flex-1">
                <label htmlFor="stage" className="label">שלב</label>
                <select id="stage" name="stage" defaultValue={lead.stage} className="input">
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <SubmitButton className="btn-secondary shrink-0 px-3" pendingText="…">עדכון</SubmitButton>
            </form>
            <form action={setFollowUpDateAction} className="flex items-end gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <div className="min-w-0 flex-1">
                <label htmlFor="follow_up_date" className="label">פולואפ הבא</label>
                <input id="follow_up_date" name="follow_up_date" type="date" defaultValue={lead.follow_up_date ?? ""} className="input" />
              </div>
              <SubmitButton className="btn-secondary shrink-0 px-3" pendingText="…">קביעה</SubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className="card" aria-labelledby="trip-title">
        <h2 id="trip-title" className="mb-2 font-bold">פרטי הנסיעה והלקוח</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[
            ["יעד", lead.destination],
            ["תאריכים", lead.depart_date ? formatDateRange(lead.depart_date, lead.return_date) : null],
            ["הערת תאריכים", lead.dates_note],
            ["נוסעים", lead.passengers],
            ["תקציב", lead.budget_amount ? formatMoney(lead.budget_amount, lead.budget_currency) : null],
            ["פולואפ", lead.follow_up_date ? `${formatDate(lead.follow_up_date)} (${relativeDays(lead.follow_up_date, today)})` : null],
            ["הצעה נשלחה", lead.quote_sent_at ? formatDateTime(lead.quote_sent_at) : null],
            ["תגובת לקוח אחרונה", lead.last_customer_reply_at ? formatDateTime(lead.last_customer_reply_at) : null],
            ["קשר אחרון מאיתנו", lead.last_contacted_at ? formatDateTime(lead.last_contacted_at) : null],
            ["מקור", lead.source],
            ["אימייל", lead.email],
            ["הסכמה", CONSENT_LABELS[lead.consent]],
            ["נוצר", formatDateTime(lead.created_at)],
            ["סיבת אובדן", lead.lost_reason],
          ]
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => (
              <div key={String(k)} className="min-w-0">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
        </dl>
        {lead.notes ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500">הערות</div>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </div>
        ) : null}
      </section>

      <section id="bookings" className="card scroll-mt-4 space-y-3" aria-labelledby="book-title">
        <h2 id="book-title" className="font-bold">הזמנות ורווח</h2>
        {saved === "confirmed" ? <Notice tone="success">ההזמנה נשמרה כמאושרת והליד סומן ״נסגר״.</Notice> : null}
        {saved === "booking" ? <Notice tone="success">ההזמנה נשמרה. היא תיספר ברווח רק אחרי שתסומן ״מאושר״.</Notice> : null}
        {bookings.map((b) => (
          <details key={b.id} className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : b.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-900"}`}>{BOOKING_STATUS_LABELS[b.status]}</span>{" "}
              <span className="text-sm">
                מחיר {formatMoney(b.selling_price, b.currency)} · רווח צפוי {formatMoney(b.expected_profit, b.currency)} · בפועל {formatMoney(b.actual_profit_received, b.currency)}
              </span>
            </summary>
            <div className="mt-3"><BookingForm key={`${b.id}-${b.status}`} leadId={lead.id} booking={b} /></div>
          </details>
        ))}
        <details className="rounded-xl border border-dashed border-slate-300 p-3" open={bookings.length === 0 && lead.stage === "READY_TO_BOOK"}>
          <summary className="cursor-pointer font-semibold text-brand-800">+ הזמנה חדשה</summary>
          <div className="mt-3"><BookingForm key={bookings.length} leadId={lead.id} /></div>
        </details>
      </section>

      <section className="card space-y-3" aria-labelledby="hist-title">
        <h2 id="hist-title" className="font-bold">הערות והיסטוריה</h2>
        <form action={addNoteAction} className="space-y-2">
          <input type="hidden" name="id" value={lead.id} />
          <label htmlFor="note" className="sr-only">הערה חדשה</label>
          <textarea id="note" name="body" rows={2} required placeholder="מה סוכם בשיחה? מה הלקוח ביקש?" className="input" />
          <SubmitButton className="btn-secondary btn-sm">הוספת הערה</SubmitButton>
        </form>
        <Timeline events={events} />
      </section>

      <section className="space-y-2">
        {contactable ? (
          <Quick id={lead.id} action="opt_out" className="btn-danger btn-sm">הלקוח ביקש להפסיק לקבל הודעות</Quick>
        ) : null}
        {user.role === "owner" ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">מחיקת ליד</summary>
            <form action={deleteLeadAction} className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <input type="hidden" name="id" value={lead.id} />
              <p className="mb-2 text-rose-900">המחיקה סופית ואי אפשר לבטל אותה. ליד עם הזמנות לא יימחק.</p>
              <SubmitButton className="btn-danger btn-sm" pendingText="מוחק…">למחוק את {lead.full_name}</SubmitButton>
            </form>
          </details>
        ) : null}
      </section>
    </div>
  );
}
