import { logoutAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { SCORE_DISCLAIMER } from "@/lib/scoring";
import { PasswordForm } from "./password-form";

export const metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="הגדרות" />
      <section className="card">
        <h2 className="font-bold">החשבון שלי</h2>
        <p className="mt-1 text-sm text-slate-700">{user.name} · <span dir="ltr">{user.email}</span> · {user.role === "owner" ? "בעלים" : "סוכן/ת"}</p>
        <form action={logoutAction} className="mt-3">
          <SubmitButton className="btn-secondary" pendingText="יוצא…">יציאה מהמערכת</SubmitButton>
        </form>
      </section>

      {user.role === "owner" ? (
        <section className="card">
          <h2 className="font-bold">ייצוא וגיבוי</h2>
          <p className="mt-1 text-sm text-slate-600">הורדת כל הנתונים כקובצי CSV שנפתחים באקסל. מומלץ להוריד גיבוי פעם בשבוע ולשמור במקום מאובטח — הקבצים מכילים פרטי לקוחות.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/api/export/leads" className="btn-secondary" download>ייצוא לידים</a>
            <a href="/api/export/bookings" className="btn-secondary" download>ייצוא הזמנות</a>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2 className="font-bold">שינוי סיסמה</h2>
        <PasswordForm />
      </section>

      <section className="card text-sm text-slate-700">
        <h2 className="font-bold text-slate-900">איך המערכת עובדת</h2>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>{SCORE_DISCLAIMER}</li>
          <li>הודעות אינן נשלחות אוטומטית. המערכת מכינה טיוטה, ואת השליחה מבצעים ידנית בוואטסאפ.</li>
          <li>לקוח שסומן ״לא ליצור קשר״ לא מופיע ברשימות הפנייה ולא ניתן להכין לו הודעה.</li>
          <li>המערכת לא מחוברת ל-Sky360: מחירים, עלויות ואסמכתאות מוזנים ידנית אחרי בדיקה מול הספק.</li>
          <li>ניסוח AI: {aiEnabled() ? "מופעל (הטיוטות עדיין עוברות בדיקת תוכן ואישור שלך)" : "כבוי — הטיוטות נוצרות מתבניות קבועות, ללא עלות"}.</li>
        </ul>
      </section>
    </div>
  );
}
