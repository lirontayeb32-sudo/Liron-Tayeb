import Link from "next/link";
import { LeadCard } from "@/components/lead-card";
import { EmptyState, Notice, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatMoney, formatPercent } from "@/lib/format";
import { getDashboard, type MoneyByCurrency } from "@/lib/queries";
import { SCORE_DISCLAIMER } from "@/lib/scoring";

export const metadata = { title: "היום" };

function money(rows: MoneyByCurrency[]) {
  if (!rows.length) return formatMoney(0);
  return rows.map((r) => formatMoney(r.amount, r.currency)).join(" · ");
}

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard(user.id);
  const dateLabel = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());
  const empty = d.conversion.total === 0;

  return (
    <>
      <PageHeader title={`בוקר טוב, ${user.name.split(" ")[0]}`} subtitle={dateLabel} action={<Link href="/leads/new" className="btn-primary btn-sm">+ ליד</Link>} />

      {empty ? (
        <EmptyState title="עדיין אין לידים במערכת">
          <p>מתחילים בייבוא קובץ הלידים הקיים (CSV או Excel), או בהוספת ליד ראשון ידנית.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/import" className="btn-primary">ייבוא לידים</Link>
            <Link href="/leads/new" className="btn-secondary">ליד חדש</Link>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <section aria-label="מדדים" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="פניות חדשות היום" value={d.newToday} hint={`${d.newWeek} ב-7 ימים`} href="/leads?view=all&sort=created" />
            <Stat label="לידים חמים" value={d.hotCount} hint="ציון 60 ומעלה" href="/leads?view=hot" tone={d.hotCount ? "alert" : "default"} />
            <Stat label="פולואפים להיום" value={d.followUpsDue} hint="כולל איחורים" href="/leads?view=due&sort=follow_up" tone={d.followUpsDue ? "alert" : "default"} />
            <Stat label="הצעות שמחכות לתגובה" value={d.quotesAwaiting} href="/leads?view=quoted" />
            <Stat label="מחכים להצעה מעודכנת" value={d.waitingQuoteUpdate.length} href="/leads?view=waiting_quote" tone={d.waitingQuoteUpdate.length ? "alert" : "default"} />
            <Stat label="מחכים לתשובה מאיתנו" value={d.waitingOurReply} href="/leads?view=waiting_reply" tone={d.waitingOurReply ? "alert" : "default"} />
            <Stat label="הזמנות שאושרו החודש" value={d.bookingsWonMonth} hint={d.pendingBookings ? `${d.pendingBookings} ממתינות לאישור` : undefined} href="/profit" tone="good" />
            <Stat label="רווח גולמי בפועל החודש" value={money(d.profitMonth)} hint={`סה״כ: ${money(d.profitAll)}`} href="/profit" tone="good" />
          </section>

          {d.wonWithoutBooking > 0 ? (
            <Notice tone="warn">
              {d.wonWithoutBooking} לידים מסומנים ״נסגר״ בלי הזמנה מאושרת — הם לא נספרים ברווח עד שתוזן הזמנה מאושרת.{" "}
              <Link href="/leads?view=all&stage=WON" className="font-semibold underline">לצפייה</Link>
            </Notice>
          ) : null}

          <section aria-labelledby="priority-title">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id="priority-title" className="text-lg font-bold">למי לפנות היום</h2>
              <span className="text-sm text-slate-500">{d.priority.length} לידים</span>
            </div>
            {d.priority.length ? (
              <ol className="space-y-2">
                {d.priority.map((lead, i) => (
                  <li key={lead.id}>
                    <LeadCard lead={lead} today={d.today} rank={i + 1} />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="אין כרגע לידים שדורשים פנייה">כל הלידים הפתוחים טופלו או שאינם ניתנים לפנייה.</EmptyState>
            )}
            <p className="mt-2 text-xs text-slate-500">{SCORE_DISCLAIMER}</p>
          </section>

          {d.waitingQuoteUpdate.length ? (
            <section aria-labelledby="wq-title">
              <h2 id="wq-title" className="mb-2 text-lg font-bold">מחכים להצעה מעודכנת</h2>
              <ul className="space-y-2">
                {d.waitingQuoteUpdate.slice(0, 8).map((lead) => (
                  <li key={lead.id}><LeadCard lead={lead} today={d.today} /></li>
                ))}
              </ul>
            </section>
          ) : null}

          {d.closest.length ? (
            <section aria-labelledby="close-title">
              <h2 id="close-title" className="mb-2 text-lg font-bold">הכי קרובים לסגירה</h2>
              <ul className="space-y-2">
                {d.closest.map((lead) => (
                  <li key={lead.id}><LeadCard lead={lead} today={d.today} /></li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="card">
              <h2 className="font-bold">יחס המרה מליד להזמנה</h2>
              <p className="mt-1 text-3xl font-bold tabular-nums">{formatPercent(d.conversion.rate)}</p>
              <p className="mt-1 text-sm text-slate-600">
                {d.conversion.booked} לידים עם הזמנה מאושרת מתוך {d.conversion.total} לידים במערכת.
              </p>
              {d.expectedProfitPending.length ? (
                <p className="mt-2 text-sm text-slate-600">רווח צפוי בהזמנות שממתינות לאישור: {money(d.expectedProfitPending)}</p>
              ) : null}
            </div>
            <div className="card">
              <h2 className="font-bold">היעדים המבוקשים ביותר</h2>
              {d.destinations.length ? (
                <ol className="mt-2 space-y-1.5">
                  {d.destinations.map((x) => (
                    <li key={x.destination} className="flex items-center gap-2 text-sm">
                      <Link href={`/leads?view=all&q=${encodeURIComponent(x.destination)}`} className="w-24 shrink-0 truncate font-medium text-brand-800 underline-offset-2 hover:underline">{x.destination}</Link>
                      <span className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max(6, (x.count / d.destinations[0].count) * 55)}%` }} aria-hidden="true" />
                      <span className="text-slate-600 tabular-nums">{x.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-slate-600">עדיין לא הוזנו יעדים.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
