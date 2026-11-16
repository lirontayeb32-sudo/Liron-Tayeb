import Link from "next/link";
import { formatDateRange, relativeDays } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import type { ScoredLead } from "@/lib/queries";
import { ScoreBadge, StagePill } from "./ui";

/** One lead in a list: who, what trip, why now. The whole card opens the lead. */
export function LeadCard({ lead, today, rank }: { lead: ScoredLead; today: string; rank?: number }) {
  const trip = [
    lead.destination,
    lead.depart_date ? formatDateRange(lead.depart_date, lead.return_date) : null,
    lead.passengers ? `${lead.passengers} נוסעים` : null,
  ].filter(Boolean);
  const due = lead.follow_up_date && lead.follow_up_date <= today;
  return (
    <Link href={`/leads/${lead.id}`} className="card flex items-start gap-3 p-3 hover:border-brand-500 active:bg-slate-50">
      <ScoreBadge score={lead.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {rank ? <span className="text-xs font-semibold text-slate-400 tabular-nums">{rank}.</span> : null}
          <span className="truncate font-semibold text-slate-900">{lead.full_name}</span>
          <StagePill stage={lead.stage} />
        </div>
        {trip.length ? <div className="mt-0.5 truncate text-sm text-slate-600">{trip.join(" · ")}</div> : null}
        <div className={`mt-1 text-sm ${lead.score.actionable ? "text-slate-800" : "text-slate-500"}`}>{lead.score.summary}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
          {lead.phone_e164 ? <span dir="ltr">{formatPhone(lead.phone_e164)}</span> : <span>אין טלפון</span>}
          {lead.follow_up_date ? (
            <span className={due ? "font-semibold text-rose-700" : ""}>פולואפ: {relativeDays(lead.follow_up_date, today)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
