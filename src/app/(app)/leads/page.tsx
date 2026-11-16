import Link from "next/link";
import { LeadCard } from "@/components/lead-card";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayIL } from "@/lib/dates";
import { listLeads } from "@/lib/queries";
import { STAGE_LABELS, STAGES } from "@/lib/types";

export const metadata = { title: "לידים" };

const VIEWS = [
  ["open", "פתוחים"],
  ["hot", "חמים"],
  ["due", "פולואפ להיום"],
  ["waiting_reply", "מחכים לתשובה"],
  ["waiting_quote", "מחכים להצעה"],
  ["quoted", "הצעה בלי תגובה"],
  ["all", "הכול"],
  ["dnc", "לא ליצור קשר"],
] as const;

const SORTS = [
  ["score", "ציון עדיפות"],
  ["follow_up", "תאריך פולואפ"],
  ["depart", "תאריך יציאה"],
  ["created", "החדשים קודם"],
  ["name", "שם"],
] as const;

type Params = { q?: string; stage?: string; view?: string; sort?: string; page?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : "open";
  const sort = SORTS.some(([s]) => s === sp.sort) ? sp.sort! : "score";
  const { leads, total, page, pages } = await listLeads(user.id, { q: sp.q, stage: sp.stage, view, sort, page: Number(sp.page) || 1 });
  const today = todayIL();

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, stage: sp.stage, view, sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/leads?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="לידים" subtitle={`${total} תוצאות`} action={<Link href="/leads/new" className="btn-primary btn-sm">+ ליד</Link>} />

      <form action="/leads" method="get" role="search" className="mb-3 space-y-2">
        <input type="hidden" name="view" value={view} />
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">חיפוש</label>
          <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="חיפוש לפי שם, טלפון, יעד או הערה" className="input" enterKeyHint="search" />
          <button type="submit" className="btn-secondary shrink-0">חיפוש</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="stage" className="sr-only">שלב</label>
            <select id="stage" name="stage" defaultValue={sp.stage ?? ""} className="input">
              <option value="">כל השלבים</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="sr-only">מיון</label>
            <select id="sort" name="sort" defaultValue={sort} className="input">
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>מיון: {label}</option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <nav aria-label="תצוגות" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={href({ view: v, page: undefined })} aria-current={v === view ? "true" : undefined} className={`chip ${v === view ? "chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </nav>

      {leads.length ? (
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li key={lead.id}><LeadCard lead={lead} today={today} /></li>
          ))}
        </ul>
      ) : (
        <EmptyState title="לא נמצאו לידים">
          {sp.q || sp.stage || view !== "open" ? (
            <Link href="/leads?view=all" className="font-semibold text-brand-700 underline">ניקוי הסינון</Link>
          ) : (
            <Link href="/import" className="font-semibold text-brand-700 underline">ייבוא לידים מקובץ</Link>
          )}
        </EmptyState>
      )}

      {pages > 1 ? (
        <nav aria-label="עמודים" className="mt-4 flex items-center justify-between">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="btn-secondary btn-sm">הקודם</Link> : <span />}
          <span className="text-sm text-slate-600">עמוד {page} מתוך {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="btn-secondary btn-sm">הבא</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
