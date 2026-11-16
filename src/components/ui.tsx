import Link from "next/link";
import { HOT_THRESHOLD, type LeadScore } from "@/lib/scoring";
import { STAGE_LABELS, type Stage } from "@/lib/types";

const STAGE_STYLE: Record<Stage, string> = {
  NEW: "bg-brand-50 text-brand-800 border-brand-200",
  QUALIFYING: "bg-violet-50 text-violet-800 border-violet-200",
  QUOTED: "bg-amber-50 text-amber-900 border-amber-200",
  FOLLOW_UP: "bg-slate-100 text-slate-700 border-slate-200",
  READY_TO_BOOK: "bg-emerald-50 text-emerald-800 border-emerald-200",
  WON: "bg-emerald-700 text-white border-emerald-700",
  LOST: "bg-slate-200 text-slate-600 border-slate-300",
};

export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STAGE_STYLE[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function ScoreBadge({ score, size = "md" }: { score: LeadScore; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "h-14 w-14 text-xl" : "h-11 w-11 text-base";
  if (!score.actionable) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 ${dims}`} title={score.blockedReason ?? ""} aria-label={score.blockedReason ?? "לא פעיל"}>
        —
      </span>
    );
  }
  const tone =
    score.score >= HOT_THRESHOLD
      ? "bg-rose-600 text-white"
      : score.score >= 35
        ? "bg-amber-400 text-amber-950"
        : "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${tone} ${dims}`} aria-label={`ציון עדיפות ${score.score} מתוך 100`}>
      {score.score}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, href, tone = "default" }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: "default" | "alert" | "good" }) {
  const color = tone === "alert" ? "text-rose-700" : tone === "good" ? "text-emerald-700" : "text-slate-900";
  const body = (
    <>
      <div className="text-[13px] leading-tight text-slate-600">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </>
  );
  const cls = "card block p-3";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand-500 active:bg-slate-50`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {children ? <div className="mt-2 text-sm text-slate-600">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: React.ReactNode }) {
  const styles = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-rose-300 bg-rose-50 text-rose-800",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}
