"use client";

import { loginAction } from "@/app/actions/auth";
import { useServerForm } from "@/components/use-server-form";

export function LoginForm() {
  const { state, pending, onSubmit } = useServerForm(loginAction);
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div>
        <label htmlFor="email" className="label">אימייל</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required dir="ltr" className="input text-left" />
      </div>
      <div>
        <label htmlFor="password" className="label">סיסמה</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" className="input text-left" />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={pending} aria-busy={pending}>{pending ? "נכנס…" : "כניסה"}</button>
    </form>
  );
}
