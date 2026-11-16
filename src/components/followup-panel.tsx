"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { approveMessageAction, generateDraftAction, markSentAction, reopenMessageAction } from "@/app/actions/followup";
import { formatDate, relativeDays } from "@/lib/dates";
import { checkMessage, MAX_MESSAGE_LENGTH } from "@/lib/guardrails";
import { whatsappLink } from "@/lib/phone";
import type { FollowupMessage } from "@/lib/types";

interface Props {
  leadId: string;
  phone: string | null;
  message: Pick<FollowupMessage, "id" | "body" | "status" | "suggested_action" | "reason" | "next_follow_up" | "generator"> | null;
  blockedReason: string | null;
  aiEnabled: boolean;
  today: string;
}

export function FollowupPanel({ leadId, phone, message, blockedReason, aiEnabled, today }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [variant, setVariant] = useState(0);
  const [text, setText] = useState(message?.body ?? "");
  const [syncedId, setSyncedId] = useState(message?.id ?? null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A new draft arrived from the server → load it into the editor.
  if ((message?.id ?? null) !== syncedId) {
    setSyncedId(message?.id ?? null);
    setText(message?.body ?? "");
    setVerified(false);
  }

  const issues = useMemo(() => checkMessage(text), [text]);
  const needsConfirm = issues.some((i) => i.rule !== "length" && i.rule !== "empty");

  const run = (fn: () => Promise<{ ok: boolean; error?: string; notice?: string }>) => {
    setError(null);
    setNotice(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "הפעולה נכשלה, נסו שוב");
        if (res.notice) setNotice(res.notice);
        router.refresh();
      } catch {
        setError("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
      }
    });
  };

  const generate = (useAI: boolean, nextVariant = variant) => {
    setVariant(nextVariant);
    run(() => generateDraftAction(leadId, nextVariant, useAI));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message?.body ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("ההעתקה נכשלה — אפשר לסמן את הטקסט ולהעתיק ידנית");
    }
  };

  if (blockedReason) {
    return (
      <section className="card border-rose-200 bg-rose-50" aria-labelledby="fu-title">
        <h2 id="fu-title" className="font-bold text-rose-900">אין לפנות ללקוח הזה</h2>
        <p className="mt-1 text-sm text-rose-800">{blockedReason}. לא ניתן להכין או לשלוח הודעות.</p>
      </section>
    );
  }

  return (
    <section className="card space-y-3" aria-labelledby="fu-title">
      <div className="flex items-center justify-between">
        <h2 id="fu-title" className="font-bold">הודעת פולואפ</h2>
        {message ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${message.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
            {message.status === "approved" ? "אושרה — מוכנה לשליחה" : "טיוטה"}
            {message.generator === "ai" ? " · AI" : ""}
          </span>
        ) : null}
      </div>

      {!message ? (
        <>
          <p className="text-sm text-slate-600">המערכת תכין טיוטה קצרה בעברית לפי מצב הליד. שום דבר לא נשלח אוטומטית — תמיד עורכים, מאשרים ושולחים ידנית.</p>
          <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => generate(false, 0)}>
            {pending ? "מכין…" : "הכנת הודעת פולואפ"}
          </button>
        </>
      ) : (
        <>
          <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
            <div><dt className="inline font-semibold">הצעד הבא: </dt><dd className="inline">{message.suggested_action}</dd></div>
            <div><dt className="inline font-semibold">למה: </dt><dd className="inline">{message.reason}</dd></div>
            {message.next_follow_up ? (
              <div><dt className="inline font-semibold">פולואפ הבא: </dt><dd className="inline">{formatDate(message.next_follow_up)} ({relativeDays(message.next_follow_up, today)})</dd></div>
            ) : null}
          </dl>

          {message.status === "draft" ? (
            <>
              <div>
                <label htmlFor="fu-text" className="label">נוסח ההודעה (אפשר לערוך)</label>
                <textarea id="fu-text" rows={6} value={text} maxLength={MAX_MESSAGE_LENGTH + 200} onChange={(e) => { setText(e.target.value); setVerified(false); }} className="input leading-relaxed" />
                <div className="mt-1 text-xs text-slate-500 tabular-nums">{text.trim().length} / {MAX_MESSAGE_LENGTH} תווים</div>
              </div>
              {issues.length ? (
                <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <ul className="list-disc space-y-1 pr-4">
                    {issues.map((i) => (
                      <li key={i.rule}>{i.message}{i.match ? ` (״${i.match}״)` : ""}</li>
                    ))}
                  </ul>
                  {needsConfirm ? (
                    <label className="flex items-start gap-2 font-medium">
                      <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 h-5 w-5 accent-amber-700" />
                      בדקתי את הפרטים האלה מול הספק והם נכונים
                    </label>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="btn-primary w-full" disabled={pending || !text.trim() || text.trim().length > MAX_MESSAGE_LENGTH || (needsConfirm && !verified)} onClick={() => run(() => approveMessageAction(message.id, text, verified))}>
                {pending ? "שומר…" : "אישור ההודעה"}
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm flex-1" disabled={pending} onClick={() => generate(false, variant + 1)}>ניסוח אחר</button>
                {aiEnabled ? (
                  <button type="button" className="btn-secondary btn-sm flex-1" disabled={pending} onClick={() => generate(true)}>שיפור ניסוח עם AI</button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="rounded-xl border border-slate-200 bg-white p-3 leading-relaxed whitespace-pre-wrap">{message.body}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={copy}>{copied ? "הועתק ✓" : "העתקה"}</button>
                {phone ? (
                  <a className="btn-whatsapp" href={whatsappLink(phone, message.body)} target="_blank" rel="noopener noreferrer">פתיחה בוואטסאפ</a>
                ) : (
                  <span className="btn-secondary pointer-events-none opacity-50" aria-disabled="true">אין מספר טלפון</span>
                )}
              </div>
              <p className="text-xs text-slate-500">הקישור פותח את וואטסאפ עם הטקסט מוכן — השליחה עצמה נעשית על ידך.</p>
              <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => run(() => markSentAction(message.id))}>
                {pending ? "מעדכן…" : "שלחתי — לעדכן את הליד"}
              </button>
              <button type="button" className="btn-secondary btn-sm w-full" disabled={pending} onClick={() => run(() => reopenMessageAction(message.id))}>חזרה לעריכה</button>
            </>
          )}
        </>
      )}
      <div aria-live="polite">
        {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">{notice}</p> : null}
      </div>
    </section>
  );
}
