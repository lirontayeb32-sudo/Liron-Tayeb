/**
 * Phone normalization for duplicate detection.
 * Output is E.164 (+9725XXXXXXXX). Israeli numbers are assumed unless the
 * input carries an explicit international prefix (+ or 00).
 */
export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

export function normalizePhone(input: unknown): PhoneResult {
  if (input === null || input === undefined) return { ok: false, reason: "חסר מספר טלפון" };
  let s = String(input).trim();
  if (!s) return { ok: false, reason: "חסר מספר טלפון" };

  // Excel sometimes hands numbers over as "5.01234567E8" or "501234567.0"
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = String(Math.round(Number(s)));
  s = s.replace(/\.0+$/, "");

  const hasPlus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "מספר טלפון לא תקין" };

  let international = hasPlus;
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }

  if (international || digits.startsWith("972")) {
    if (digits.startsWith("972")) {
      let national = digits.slice(3);
      if (national.startsWith("0")) national = national.slice(1); // +972-054...
      return israeli(national);
    }
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, reason: "מספר בינלאומי באורך לא תקין" };
    }
    return { ok: true, e164: `+${digits}` };
  }

  if (digits.startsWith("0")) return israeli(digits.slice(1));
  // Leading zero stripped by a spreadsheet: 9 digits starting with 5 (mobile)
  if (digits.length === 9 && digits.startsWith("5")) return israeli(digits);
  return { ok: false, reason: "מספר טלפון לא תקין (צריך להתחיל ב-0 או בקידומת מדינה)" };
}

function israeli(national: string): PhoneResult {
  // Mobile: 5X + 7 digits (9 total). Landline: 2/3/4/8/9 + 7 digits (8 total). VoIP: 7X + 7 digits.
  if (/^5\d{8}$/.test(national) || /^7\d{8}$/.test(national) || /^[23489]\d{7}$/.test(national)) {
    return { ok: true, e164: `+972${national}` };
  }
  return { ok: false, reason: "מספר ישראלי באורך לא תקין" };
}

/** 054-123-4567 style display for Israeli numbers; E.164 otherwise. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+972")) {
    const n = "0" + e164.slice(4);
    if (n.length === 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
    if (n.length === 9) return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
    return n;
  }
  return e164;
}

/** wa.me draft link — opens WhatsApp with the text pre-filled; nothing is sent automatically. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
