"use client";

import { changePasswordAction } from "@/app/actions/auth";
import { useServerForm } from "@/components/use-server-form";

export function PasswordForm() {
  const { state, pending, onSubmit } = useServerForm(changePasswordAction);
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <div>
        <label htmlFor="current" className="label">סיסמה נוכחית</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required dir="ltr" className="input text-left" />
      </div>
      <div>
        <label htmlFor="next" className="label">סיסמה חדשה (לפחות 10 תווים)</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} dir="ltr" className="input text-left" />
      </div>
      {state.error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</p> : null}
      <button type="submit" className="btn-secondary" disabled={pending} aria-busy={pending}>{pending ? "מעדכן…" : "עדכון סיסמה"}</button>
      <p className="text-xs text-slate-500">אחרי העדכון תתבצע יציאה מכל המכשירים ותתבקשו להיכנס מחדש.</p>
    </form>
  );
}
