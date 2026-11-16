import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getProfit } from "@/lib/queries";
import { BOOKING_STATUS_LABELS, FOLLOW_UP_SOURCE_LABELS } from "@/lib/types";

export const metadata = { title: "רווח" };

export default async function ProfitPage() {
  const user = await requireUser();
  const { bookings, summary, bySource } = await getProfit(user.id);
  const missing = summary.reduce((s, r) => s + r.missing_actual, 0);

  return (
    <>
      <PageHeader title="הזמנות ורווח" subtitle="רק הזמנות שסומנו ״מאושר״ נספרות" />
      {!bookings.length ? (
        <EmptyState title="עדיין אין הזמנות">
          הזמנה מוסיפים מתוך עמוד הליד, תחת ״הזמנות ורווח״. <Link href="/leads?view=hot" className="font-semibold text-brand-700 underline">ללידים החמים</Link>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {summary.map((s) => (
            <section key={s.currency} className="card" aria-label={`סיכום ${s.currency}`}>
              <h2 className="mb-3 font-bold">סיכום הזמנות מאושרות ({s.currency}) — {s.confirmed_count}</h2>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">הכנסות (מחיר ללקוח)</dt><dd className="text-xl font-bold tabular-nums">{formatMoney(s.revenue, s.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">עלות ספק</dt><dd className="text-xl font-bold tabular-nums">{formatMoney(s.supplier_cost, s.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">רווח גולמי צפוי</dt><dd className="text-xl font-bold tabular-nums">{formatMoney(s.expected_profit, s.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">רווח שהתקבל בפועל</dt><dd className="text-xl font-bold text-emerald-700 tabular-nums">{formatMoney(s.actual_profit, s.currency)}</dd></div>
              </dl>
              {s.pending_count ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  בנוסף, {s.pending_count} הזמנות ממתינות לאישור עם רווח צפוי של {formatMoney(s.pending_expected, s.currency)} — לא נכלל בסיכום.
                </p>
              ) : null}
            </section>
          ))}
          {missing ? <Notice tone="warn">ב-{missing} הזמנות מאושרות עדיין לא הוזן רווח בפועל — הן נספרות כ-0 ברווח שהתקבל.</Notice> : null}

          {bySource.length ? (
            <section className="card">
              <h2 className="mb-2 font-bold">מה הביא לסגירות</h2>
              <ul className="space-y-1 text-sm">
                {bySource.map((r) => (
                  <li key={`${r.source}-${r.currency}`} className="flex justify-between gap-3">
                    <span>{r.source ? (FOLLOW_UP_SOURCE_LABELS[r.source as keyof typeof FOLLOW_UP_SOURCE_LABELS] ?? r.source) : "לא צוין"}</span>
                    <span className="tabular-nums text-slate-700">{r.count} הזמנות · {formatMoney(r.profit, r.currency)} רווח בפועל</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="all-title">
            <h2 id="all-title" className="mb-2 text-lg font-bold">כל ההזמנות</h2>
            <ul className="space-y-2">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link href={`/leads/${b.lead_id}`} className="card block p-3 hover:border-brand-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.lead_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : b.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-900"}`}>{BOOKING_STATUS_LABELS[b.status]}</span>
                      {b.closed_at ? <span className="text-xs text-slate-500">{formatDate(b.closed_at)}</span> : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {[b.lead_destination, b.booking_reference ? `אסמכתא ${b.booking_reference}` : null].filter(Boolean).join(" · ")}
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-2 text-sm">
                      <div><dt className="text-xs text-slate-500">מחיר</dt><dd className="tabular-nums">{formatMoney(b.selling_price, b.currency)}</dd></div>
                      <div><dt className="text-xs text-slate-500">עלות</dt><dd className="tabular-nums">{formatMoney(b.supplier_cost, b.currency)}</dd></div>
                      <div><dt className="text-xs text-slate-500">צפוי</dt><dd className="tabular-nums">{formatMoney(b.expected_profit, b.currency)}</dd></div>
                      <div><dt className="text-xs text-slate-500">בפועל</dt><dd className="font-semibold tabular-nums">{formatMoney(b.actual_profit_received, b.currency)}</dd></div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
