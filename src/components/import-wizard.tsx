"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { commitImportAction, previewImportAction, type CommitResult } from "@/app/actions/import";
import { formatDate } from "@/lib/dates";
import { IMPORT_FIELD_LABELS, IMPORT_FIELDS, suggestMapping, type ColumnMapping, type ImportField, type PreviewRow, type RawCell } from "@/lib/import";
import { decodeCsvBytes, parseCsvText, serializeRows, tableFromRows, type ParsedTable } from "@/lib/import-parse";
import { formatPhone } from "@/lib/phone";
import { STAGE_LABELS } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const STATUS: Record<PreviewRow["status"], { label: string; cls: string }> = {
  new: { label: "חדש", cls: "bg-emerald-100 text-emerald-800" },
  duplicate_db: { label: "כבר קיים במערכת", cls: "bg-amber-100 text-amber-900" },
  duplicate_file: { label: "כפול בקובץ", cls: "bg-amber-100 text-amber-900" },
  error: { label: "שגיאה", cls: "bg-rose-100 text-rose-800" },
};

async function readFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return tableFromRows((await readSheet(file)) as RawCell[][]);
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsvText(decodeCsvBytes(new Uint8Array(await file.arrayBuffer())));
  }
  throw new Error("סוג קובץ לא נתמך. אפשר לייבא קובצי CSV או Excel ‏(xlsx).");
}

export function ImportWizard() {
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [filename, setFilename] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; counts: Record<PreviewRow["status"], number> } | null>(null);
  const [fillEmpty, setFillEmpty] = useState(false);
  const [filter, setFilter] = useState<PreviewRow["status"] | "all">("all");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setTable(null); setMapping(null); setPreview(null); setResult(null); setError(null); setFilename(""); setFilter("all");
  };

  const runPreview = (t: ParsedTable, m: ColumnMapping) => {
    setError(null);
    start(async () => {
      try {
        const res = await previewImportAction(serializeRows(t.rows), m);
        if (!res.ok || !res.rows || !res.counts) {
          setPreview(null);
          setError(res.error ?? "לא הצלחנו לקרוא את הקובץ");
          return;
        }
        setPreview({ rows: res.rows, counts: res.counts });
      } catch {
        setError("אין חיבור לשרת, או שהקובץ גדול מדי. נסו שוב.");
      }
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    if (file.size > MAX_FILE_BYTES) return setError("הקובץ גדול מדי (עד 5MB). אפשר לפצל אותו לכמה קבצים.");
    try {
      const t = await readFile(file);
      if (!t.rows.length) return setError("לא נמצאו שורות נתונים בקובץ. השורה הראשונה צריכה להכיל כותרות עמודות.");
      const m = suggestMapping(t.headers);
      setFilename(file.name);
      setTable(t);
      setMapping(m);
      if (m.full_name >= 0 && m.phone >= 0) runPreview(t, m);
    } catch (e) {
      setError(e instanceof Error && /[֐-׿]/.test(e.message) ? e.message : "לא הצלחנו לקרוא את הקובץ. ודאו שזה קובץ CSV או xlsx תקין.");
    }
  };

  const changeMapping = (field: ImportField, col: number) => {
    if (!mapping || !table) return;
    const next = { ...mapping, [field]: col };
    setMapping(next);
    setPreview(null);
    if (next.full_name >= 0 && next.phone >= 0) runPreview(table, next);
  };

  const commit = () => {
    if (!table || !mapping) return;
    setError(null);
    start(async () => {
      try {
        const res = await commitImportAction(serializeRows(table.rows), mapping, filename, fillEmpty);
        if (!res.ok) return setError(res.error ?? "הייבוא נכשל. שום דבר לא נשמר.");
        setResult(res);
      } catch {
        setError("הייבוא נכשל ושום דבר לא נשמר. בדקו את החיבור ונסו שוב.");
      }
    });
  };

  if (result) {
    return (
      <div className="card space-y-3" role="status">
        <h2 className="text-lg font-bold text-emerald-800">הייבוא הושלם</h2>
        <ul className="space-y-1 text-sm">
          <li><strong className="tabular-nums">{result.inserted}</strong> לידים חדשים נוספו</li>
          {result.updated ? <li><strong className="tabular-nums">{result.updated}</strong> לידים קיימים הושלמו בפרטים חסרים</li> : null}
          <li><strong className="tabular-nums">{result.skipped}</strong> שורות כפולות דולגו</li>
          <li><strong className="tabular-nums">{result.errors}</strong> שורות עם שגיאה לא יובאו</li>
        </ul>
        <div className="flex gap-2">
          <Link href="/" className="btn-primary flex-1">למי לפנות היום</Link>
          <button type="button" className="btn-secondary" onClick={reset}>ייבוא קובץ נוסף</button>
        </div>
      </div>
    );
  }

  const shown = preview ? preview.rows.filter((r) => filter === "all" || r.status === filter) : [];
  const importable = preview ? preview.counts.new + (fillEmpty ? preview.counts.duplicate_db : 0) : 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label htmlFor="file" className="label">קובץ לידים (CSV או Excel)</label>
        <input id="file" type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:ml-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-700 file:px-4 file:font-semibold file:text-white" />
        <p className="text-xs text-slate-500">השורה הראשונה צריכה להכיל כותרות (שם, טלפון, יעד, תאריכים…). חובה: שם וטלפון. שום דבר לא נשמר לפני שמאשרים את התצוגה המקדימה.</p>
      </div>

      <div aria-live="polite">
        {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
      </div>

      {table && mapping ? (
        <details className="card" open={mapping.full_name < 0 || mapping.phone < 0}>
          <summary className="cursor-pointer font-bold">שיוך עמודות <span className="text-sm font-normal text-slate-600">({table.rows.length} שורות ב-{filename})</span></summary>
          {table.truncated ? <p className="mt-2 text-sm text-amber-800">הקובץ ארוך מדי — ייובאו רק 5,000 השורות הראשונות.</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <div key={f}>
                <label htmlFor={`map-${f}`} className="label">{IMPORT_FIELD_LABELS[f]}{f === "full_name" || f === "phone" ? " *" : ""}</label>
                <select id={`map-${f}`} value={mapping[f]} onChange={(e) => changeMapping(f, Number(e.target.value))} className="input">
                  <option value={-1}>— לא לייבא —</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `עמודה ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {mapping.full_name < 0 || mapping.phone < 0 ? <p className="mt-3 text-sm text-rose-700">בחרו איזו עמודה מכילה את השם ואיזו את הטלפון.</p> : null}
        </details>
      ) : null}

      {pending && !preview ? <p className="text-sm text-slate-600">בודק את הקובץ…</p> : null}

      {preview ? (
        <section className="space-y-3" aria-labelledby="prev-title">
          <h2 id="prev-title" className="text-lg font-bold">תצוגה מקדימה</h2>
          <div className="flex flex-wrap gap-2">
            {([["all", `הכול (${preview.rows.length})`], ["new", `חדשים (${preview.counts.new})`], ["duplicate_db", `קיימים (${preview.counts.duplicate_db})`], ["duplicate_file", `כפולים בקובץ (${preview.counts.duplicate_file})`], ["error", `שגיאות (${preview.counts.error})`]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`chip ${filter === k ? "chip-active" : ""}`}>{label}</button>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.slice(0, 100).map((r) => (
              <li key={r.index} className="card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 tabular-nums">שורה {r.index}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {r.lead ? <span className="font-semibold">{r.lead.full_name}</span> : null}
                  {r.lead?.phone_e164 ? <span dir="ltr" className="text-slate-600">{formatPhone(r.lead.phone_e164)}</span> : null}
                </div>
                {r.lead ? (
                  <div className="mt-1 text-slate-600">
                    {[r.lead.destination, r.lead.depart_date ? formatDate(r.lead.depart_date) : null, r.lead.passengers ? `${r.lead.passengers} נוסעים` : null, STAGE_LABELS[r.lead.stage]].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {r.existing ? <div className="mt-1 text-amber-800">אותו טלפון כמו ״{r.existing.full_name}״</div> : null}
                {r.errors.map((e) => <div key={e} className="mt-1 text-rose-700">{e}</div>)}
                {r.warnings.map((w) => <div key={w} className="mt-1 text-amber-800">{w}</div>)}
              </li>
            ))}
          </ul>
          {shown.length > 100 ? <p className="text-sm text-slate-600">מוצגות 100 שורות ראשונות מתוך {shown.length}.</p> : null}

          {preview.counts.duplicate_db > 0 ? (
            <label className="card flex items-start gap-3 p-3 text-sm">
              <input type="checkbox" checked={fillEmpty} onChange={(e) => setFillEmpty(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-700" />
              <span>להשלים פרטים חסרים בלידים קיימים ({preview.counts.duplicate_db}). מידע קיים לא יידרס; אחרת הכפולים ידולגו.</span>
            </label>
          ) : null}

          <div className="sticky bottom-16 z-10 md:bottom-2">
            <button type="button" className="btn-primary w-full shadow-lg" disabled={pending || importable === 0} onClick={commit}>
              {pending ? "מייבא…" : importable === 0 ? "אין שורות לייבוא" : `ייבוא ${importable} לידים`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
