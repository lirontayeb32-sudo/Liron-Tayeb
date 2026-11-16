/** Date helpers. Business days are computed in Israel time. */
export const TZ = "Asia/Jerusalem";

/** Today's date in Israel as YYYY-MM-DD. */
export function todayIL(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Calendar date (Israel) of a timestamp, as YYYY-MM-DD. */
export function dateIL(ts: Date | string): string {
  return todayIL(typeof ts === "string" ? new Date(ts) : ts);
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

/** Friday/Saturday → the following Sunday (Israeli business week). */
export function nextBusinessDay(iso: string): string {
  const wd = weekday(iso);
  if (wd === 5) return addDays(iso, 2);
  if (wd === 6) return addDays(iso, 1);
  return iso;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = toUTC(s);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * Parses dates as they appear in Israeli spreadsheets: 25/12/2026, 25.12.26, 25-12-2026,
 * ISO 2026-12-25, or a JS Date (from XLSX). Day comes first. Returns YYYY-MM-DD or null.
 */
export function parseFlexibleDate(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (dmy) {
    let y = +dmy[3];
    if (y < 100) y += 2000;
    return build(y, +dmy[2], +dmy[1]);
  }
  return null;
}

function build(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISODate(s) && y >= 2000 && y <= 2100 ? s : null;
}

/** 25.12.26 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${+d}.${+m}.${y.slice(2)}`;
}

export function formatDateTime(ts: Date | string | null | undefined): string {
  if (!ts) return "";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const text = new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return ltr(text);
}

/** "היום" / "אתמול" / "לפני 5 ימים" / "בעוד 3 ימים" */
export function relativeDays(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "היום";
  if (diff === -1) return "אתמול";
  if (diff === 1) return "מחר";
  if (diff < 0) return `לפני ${-diff} ימים`;
  return `בעוד ${diff} ימים`;
}

/** Wraps text in Unicode LTR isolates so dates/ranges keep their order inside RTL text. */
export function ltr(text: string): string {
  return `\u2066${text}\u2069`;
}

/** "7.12.26–12.12.26" that reads start → end even inside Hebrew text. */
export function formatDateRange(from: string | null | undefined, to?: string | null): string {
  if (!from) return "";
  return ltr(to ? `${formatDate(from)}–${formatDate(to)}` : formatDate(from));
}
