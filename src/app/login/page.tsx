import { LoginForm } from "./login-form";

export const metadata = { title: "כניסה" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { changed } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700">
          <svg viewBox="0 0 180 180" width="44" height="44" aria-hidden="true">
            <path d="M38 104 142 56l-30 82-22-32-52-2z" fill="#fff" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">תכלת תיירות</h1>
        <p className="mt-1 text-sm text-slate-600">מנוע המכירות — כניסה למערכת</p>
      </div>
      {changed ? (
        <p role="status" className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          הסיסמה עודכנה. אפשר להיכנס עם הסיסמה החדשה.
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}
