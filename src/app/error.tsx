"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-sm px-5 py-20 text-center">
      <h1 className="text-xl font-bold">משהו השתבש</h1>
      <p className="mt-2 text-sm text-slate-600">הפעולה לא הושלמה. הנתונים שלך לא נפגעו — אפשר לנסות שוב.</p>
      <button type="button" onClick={reset} className="btn-primary mt-5">ניסיון נוסף</button>
    </main>
  );
}
