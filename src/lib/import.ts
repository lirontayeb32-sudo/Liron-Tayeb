/**
 * Lead import: column mapping, row normalization and duplicate classification.
 * Pure functions — file parsing (CSV/XLSX) and database access live elsewhere.
 */
import { parseFlexibleDate } from "./dates";
import { normalizePhone } from "./phone";
import { CONSENTS, CURRENCIES, STAGES, type Consent, type Currency, type Stage } from "./types";

export const IMPORT_FIELDS = [
  "full_name",
  "phone",
  "email",
  "destination",
  "depart_date",
  "return_date",
  "passengers",
  "budget_amount",
  "budget_currency",
  "stage",
  "source",
  "notes",
  "follow_up_date",
  "consent",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  full_name: "שם מלא",
  phone: "טלפון",
  email: "אימייל",
  destination: "יעד",
  depart_date: "תאריך יציאה",
  return_date: "תאריך חזרה",
  passengers: "מספר נוסעים",
  budget_amount: "תקציב",
  budget_currency: "מטבע",
  stage: "שלב",
  source: "מקור",
  notes: "הערות",
  follow_up_date: "תאריך פולואפ",
  consent: "הסכמה לדיוור",
};

const SYNONYMS: Record<ImportField, string[]> = {
  full_name: ["שם", "שם מלא", "שם הלקוח", "לקוח", "שם לקוח", "name", "full name", "fullname", "customer", "contact"],
  phone: ["טלפון", "נייד", "מספר טלפון", "טל", "פלאפון", "סלולרי", "וואטסאפ", "phone", "mobile", "tel", "whatsapp", "cell", "phone number"],
  email: ["אימייל", "מייל", "דואל", 'דוא"ל', "email", "e-mail", "mail"],
  destination: ["יעד", "לאן", "מדינה", "עיר", "destination", "dest", "country"],
  depart_date: ["תאריך יציאה", "יציאה", "מתאריך", "תאריך טיסה", "תאריך הלוך", "הלוך", "depart", "departure", "from date", "start date", "check in"],
  return_date: ["תאריך חזרה", "חזרה", "עד תאריך", "תאריך חזור", "חזור", "return", "to date", "end date", "check out"],
  passengers: ["נוסעים", "מספר נוסעים", "כמות נוסעים", "מס נוסעים", "הרכב", "pax", "passengers", "travellers", "travelers"],
  budget_amount: ["תקציב", "budget", "סכום"],
  budget_currency: ["מטבע", "currency"],
  stage: ["שלב", "סטטוס", "מצב", "stage", "status"],
  source: ["מקור", "מקור הגעה", "איך הגיע", "source", "channel", "utm_source"],
  notes: ["הערות", "הערה", "פרטים", "תיאור", "notes", "note", "comments", "comment", "message"],
  follow_up_date: ["פולואפ", "תאריך פולואפ", "מעקב", "תאריך מעקב", "follow up", "followup", "follow-up", "next contact"],
  consent: ["הסכמה", "הסכמה לדיוור", "אישור דיוור", "דיוור", "consent", "opt in", "opt-in", "marketing"],
};

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-.:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Map of field → column index (or -1). Exact header matches win over partial ones. */
export type ColumnMapping = Record<ImportField, number>;

export function suggestMapping(headers: string[]): ColumnMapping {
  const cleaned = headers.map((h) => clean(String(h ?? "")));
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, -1])) as ColumnMapping;

  for (const pass of ["exact", "partial"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== -1) continue;
      const idx = cleaned.findIndex((h, i) => {
        if (used.has(i) || !h) return false;
        return SYNONYMS[field].some((syn) =>
          pass === "exact" ? h === clean(syn) : h.includes(clean(syn)) && clean(syn).length >= 3,
        );
      });
      if (idx !== -1) {
        mapping[field] = idx;
        used.add(idx);
      }
    }
  }
  return mapping;
}

const STAGE_SYNONYMS: Record<string, Stage> = {
  חדש: "NEW",
  "פנייה חדשה": "NEW",
  "בירור צרכים": "QUALIFYING",
  בירור: "QUALIFYING",
  "נשלחה הצעה": "QUOTED",
  הצעה: "QUOTED",
  "הצעת מחיר": "QUOTED",
  במעקב: "FOLLOW_UP",
  מעקב: "FOLLOW_UP",
  פולואפ: "FOLLOW_UP",
  "מוכן לסגירה": "READY_TO_BOOK",
  "קרוב לסגירה": "READY_TO_BOOK",
  נסגר: "WON",
  סגור: "WON",
  הזמין: "WON",
  "לא רלוונטי": "LOST",
  אבוד: "LOST",
  בוטל: "LOST",
};

function parseStage(v: string): Stage | null {
  const t = v.trim();
  if (!t) return null;
  const upper = t.toUpperCase().replace(/[\s-]+/g, "_");
  if ((STAGES as readonly string[]).includes(upper)) return upper as Stage;
  return STAGE_SYNONYMS[t] ?? null;
}

function parseConsent(v: string): Consent {
  const t = v.trim().toLowerCase();
  if ((CONSENTS as readonly string[]).includes(t)) return t as Consent;
  if (["כן", "אישר", "אישרה", "מאשר", "מאשרת", "yes", "y", "true", "1", "v", "✓"].includes(t)) return "granted";
  if (["לא", "סירב", "סירבה", "no", "n", "false", "0", "הסיר", "הסירה", "stop"].includes(t)) return "denied";
  return "unknown";
}

function parseCurrency(v: string): Currency | null {
  const t = v.trim().toUpperCase();
  if ((CURRENCIES as readonly string[]).includes(t)) return t as Currency;
  if (/₪|ש"ח|ש״ח|שקל|NIS/.test(t)) return "ILS";
  if (/\$|דולר/.test(t)) return "USD";
  if (/€|יורו|אירו/.test(t)) return "EUR";
  return null;
}

function parseNumber(v: string): number | null {
  const t = v.replace(/[,\s₪$€]/g, "").replace(/(ש"ח|ש״ח|שקל|דולר|יורו)/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export interface NormalizedLead {
  full_name: string;
  phone_raw: string | null;
  phone_e164: string | null;
  email: string | null;
  destination: string | null;
  depart_date: string | null;
  return_date: string | null;
  passengers: number | null;
  budget_amount: number | null;
  budget_currency: Currency;
  stage: Stage;
  source: string | null;
  notes: string | null;
  follow_up_date: string | null;
  consent: Consent;
  do_not_contact: boolean;
}

export type RowStatus = "new" | "duplicate_db" | "duplicate_file" | "error";

export interface PreviewRow {
  index: number; // 1-based row number in the file (excluding header)
  status: RowStatus;
  lead: NormalizedLead | null;
  errors: string[];
  warnings: string[];
  existing?: { id: string; full_name: string };
}

export type RawCell = string | number | boolean | Date | null | undefined;

function cellToString(c: RawCell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
  return String(c).trim();
}

/** Strip characters that make spreadsheet apps execute a cell as a formula on re-export. */
function text(v: string, max: number): string | null {
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

export function normalizeRow(
  cells: RawCell[],
  mapping: ColumnMapping,
): { lead: NormalizedLead | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = (f: ImportField): RawCell => (mapping[f] >= 0 ? cells[mapping[f]] : null);
  const str = (f: ImportField) => cellToString(raw(f));

  const full_name = text(str("full_name"), 120);
  const phoneStr = str("phone");
  const phone = normalizePhone(phoneStr);
  if (!phone.ok) errors.push(phone.reason);
  if (!full_name) errors.push("חסר שם");

  const date = (f: ImportField, label: string) => {
    const v = raw(f);
    if (v === null || v === undefined || cellToString(v) === "") return null;
    const parsed = parseFlexibleDate(v instanceof Date ? v : cellToString(v));
    if (!parsed) warnings.push(`${label}: לא הצלחנו לקרוא את התאריך ״${cellToString(v)}״ — השדה יישאר ריק`);
    return parsed;
  };
  const depart_date = date("depart_date", "תאריך יציאה");
  let return_date = date("return_date", "תאריך חזרה");
  if (depart_date && return_date && return_date < depart_date) {
    warnings.push("תאריך החזרה לפני תאריך היציאה — תאריך החזרה יישאר ריק");
    return_date = null;
  }
  const follow_up_date = date("follow_up_date", "תאריך פולואפ");

  let passengers: number | null = null;
  const paxStr = str("passengers");
  if (paxStr) {
    const m = paxStr.match(/\d+/);
    const n = m ? Number(m[0]) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 500) passengers = n;
    else warnings.push(`מספר נוסעים לא תקין (״${paxStr}״) — השדה יישאר ריק`);
  }

  let budget_amount: number | null = null;
  const budgetStr = str("budget_amount");
  if (budgetStr) {
    const n = parseNumber(budgetStr);
    if (n !== null && !Number.isNaN(n) && n >= 0 && n <= 99_999_999) budget_amount = n;
    else warnings.push(`תקציב לא תקין (״${budgetStr}״) — השדה יישאר ריק`);
  }
  const budget_currency = parseCurrency(str("budget_currency")) ?? parseCurrency(budgetStr) ?? "ILS";

  let stage: Stage = "NEW";
  const stageStr = str("stage");
  if (stageStr) {
    const parsed = parseStage(stageStr);
    if (parsed) stage = parsed;
    else warnings.push(`שלב לא מוכר (״${stageStr}״) — ייובא כ״חדש״`);
  }

  let email = text(str("email"), 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`אימייל לא תקין (״${email}״) — השדה יישאר ריק`);
    email = null;
  }

  const consent = parseConsent(str("consent"));

  if (errors.length || !full_name || !phone.ok) return { lead: null, errors, warnings };
  return {
    lead: {
      full_name,
      phone_raw: text(phoneStr, 40),
      phone_e164: phone.e164,
      email,
      destination: text(str("destination"), 120),
      depart_date,
      return_date,
      passengers,
      budget_amount,
      budget_currency,
      stage,
      source: text(str("source"), 80),
      notes: text(str("notes"), 5000),
      follow_up_date,
      consent,
      do_not_contact: consent === "denied",
    },
    errors,
    warnings,
  };
}

/**
 * Classifies every row: new / duplicate of an existing lead / duplicate inside the file / error.
 * `existing` maps normalized phone → existing lead.
 */
export function buildPreview(
  rows: RawCell[][],
  mapping: ColumnMapping,
  existing: Map<string, { id: string; full_name: string }>,
): PreviewRow[] {
  const seen = new Set<string>();
  return rows.map((cells, i) => {
    const { lead, errors, warnings } = normalizeRow(cells, mapping);
    if (!lead) return { index: i + 1, status: "error", lead: null, errors, warnings };
    const key = lead.phone_e164!;
    const hit = existing.get(key);
    let status: RowStatus = "new";
    if (hit) status = "duplicate_db";
    else if (seen.has(key)) status = "duplicate_file";
    seen.add(key);
    return { index: i + 1, status, lead, errors, warnings, existing: hit };
  });
}

export function isBlankRow(cells: RawCell[]): boolean {
  return cells.every((c) => cellToString(c) === "");
}

export const MAX_IMPORT_ROWS = 5000;
