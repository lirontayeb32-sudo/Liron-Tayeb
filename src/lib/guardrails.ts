/**
 * Content guardrails for outgoing follow-up messages.
 *
 * Generated text must never contain prices, discounts, urgency or availability claims,
 * because the system cannot verify any of them (prices and seats live in Sky360).
 * - Generated drafts (template or AI) that trip a rule are rejected.
 * - Owner-edited text that trips a rule produces a warning the owner must explicitly confirm.
 */
export interface GuardrailIssue {
  rule: "price" | "discount" | "urgency" | "availability" | "length" | "empty";
  message: string;
  match?: string;
}

const RULES: Array<{ rule: GuardrailIssue["rule"]; re: RegExp; message: string }> = [
  {
    rule: "price",
    re: /(₪|ש"ח|ש״ח|שקל(?:ים)?|\$|€|דולר(?:ים)?|יורו|\bUSD\b|\bEUR\b|\bILS\b|\bNIS\b)/i,
    message: "ההודעה מזכירה מחיר או מטבע — ודאו שהמחיר נבדק מול הספק לפני שליחה",
  },
  {
    rule: "discount",
    re: /(הנח(?:ה|ות)|מבצע(?:ים)?|\d+\s?%|אחוז(?:ים)? הנחה|קופון|חינם|מתנה|הטבה|הטבות|שדרוג חינם)/,
    message: "ההודעה מזכירה הנחה / מבצע / הטבה — אל תבטיחו הטבה שלא אושרה",
  },
  {
    rule: "urgency",
    re: /(מקומות אחרונים|מקום אחרון|נשארו רק|נותרו רק|רק היום|עד הערב בלבד|הזדמנות אחרונה|לפני שייגמר|לפני שיאזל|אוזל|נגמרים|המחיר (?:יעלה|עולה|קופץ)|מחירים עולים|למהר|מהרו|תמהר)/,
    message: "ההודעה יוצרת תחושת דחיפות — אל תשתמשו בדחיפות שאינה מבוססת",
  },
  {
    rule: "availability",
    re: /(יש (?:עדיין )?(?:מקום|מקומות|זמינות)|זמינות (?:טובה|מלאה|מובטחת)|יש טיסות|יש טיסה|טיסה פנויה|מושבים פנויים|חדרים פנויים|שריינתי|שמרתי לך|נשמר לך|מובטח)/,
    message: "ההודעה טוענת לזמינות טיסות/מקומות — אין אימות זמינות במערכת",
  },
];

export const MAX_MESSAGE_LENGTH = 700;

export function checkMessage(text: string): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  const t = text.trim();
  if (!t) return [{ rule: "empty", message: "ההודעה ריקה" }];
  if (t.length > MAX_MESSAGE_LENGTH) {
    issues.push({ rule: "length", message: `ההודעה ארוכה מדי (${t.length} תווים) — עדיף לקצר` });
  }
  for (const r of RULES) {
    const m = t.match(r.re);
    if (m) issues.push({ rule: r.rule, message: r.message, match: m[0] });
  }
  return issues;
}

/** Issues that must be explicitly confirmed by the owner before approval. */
export function blockingIssues(text: string): GuardrailIssue[] {
  return checkMessage(text).filter((i) => i.rule !== "length");
}
