import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-sm px-5 py-20 text-center">
      <h1 className="text-xl font-bold">העמוד לא נמצא</h1>
      <p className="mt-2 text-sm text-slate-600">ייתכן שהליד נמחק או שהקישור שגוי.</p>
      <Link href="/" className="btn-primary mt-5">חזרה לעמוד הראשי</Link>
    </main>
  );
}
