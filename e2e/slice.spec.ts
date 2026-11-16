import { expect, test, type Page } from "@playwright/test";
import { E2E_USER } from "./global-setup";

// Synthetic data only. Dates are relative so the scenario stays valid over time.
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const dmy = (days: number) => iso(days).split("-").reverse().join("/");

const CSV = [
  "שם מלא,טלפון,יעד,תאריך יציאה,תאריך חזרה,נוסעים,תקציב,סטטוס,הסכמה",
  `דנה בדיקה,052-5550201,רומא,${dmy(20)},${dmy(25)},2,9000,מוכן לסגירה,כן`,
  `יוסי בדיקה,0525550202,אתונה,${dmy(45)},,4,14000,נשלחה הצעה,`,
  "מיכל בדיקה,525550203,פריז,,,,,חדש,",
  "דנה כפולה,+972525550201,רומא,,,,,,",
  "בלי טלפון,,לונדון,,,,,,",
  "רון הסיר,052-5550204,דובאי,,,,,במעקב,לא",
].join("\n");

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", E2E_USER.email);
  await page.fill("#password", E2E_USER.password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { name: /בוקר טוב/ })).toBeVisible();
}

async function upload(page: Page) {
  await page.goto("/import");
  await page.setInputFiles("#file", { name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await expect(page.getByRole("heading", { name: "תצוגה מקדימה" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors are sent to login and bad credentials are rejected", async ({ page, request }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/export/leads")).status()).toBe(401);
  await page.fill("#email", "nobody@example.test");
  await page.fill("#password", "wrong-password");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByText("אימייל או סיסמה שגויים")).toBeVisible();
});

test("login → import with preview → duplicates detected", async ({ page }) => {
  await login(page);
  await expect(page.getByText("עדיין אין לידים במערכת")).toBeVisible();

  await upload(page);
  await expect(page.getByRole("button", { name: "חדשים (4)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "כפולים בקובץ (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "שגיאות (1)" })).toBeVisible();
  // nothing is saved before confirmation
  await page.goto("/leads?view=all");
  await expect(page.getByText("לא נמצאו לידים")).toBeVisible();

  await upload(page);
  await page.getByRole("button", { name: "ייבוא 4 לידים" }).click();
  await expect(page.getByText("הייבוא הושלם")).toBeVisible();

  // importing the same file again creates nothing new
  await upload(page);
  await expect(page.getByRole("button", { name: "חדשים (0)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "קיימים (5)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "אין שורות לייבוא" })).toBeDisabled();
});

test("daily list ranks leads, explains scores and excludes opt-outs", async ({ page }) => {
  await login(page);
  const list = page.getByRole("list").filter({ has: page.getByText("דנה בדיקה") }).first();
  const first = list.getByRole("listitem").first();
  await expect(first).toContainText("דנה בדיקה");
  await expect(first).toContainText("מוכן לסגירה");
  await expect(page.locator("main")).not.toContainText("רון הסיר");
  await expect(page.locator("main")).toContainText("הוא לא הסתברות סגירה");

  await page.goto("/leads?view=dnc");
  await page.getByRole("link", { name: /רון הסיר/ }).click();
  await expect(page.getByText("אין לפנות ללקוח הזה")).toBeVisible();
  await expect(page.getByRole("button", { name: "הכנת הודעת פולואפ" })).toHaveCount(0);

  // search by phone in any format
  await page.goto("/leads?view=all&q=052-555-0202");
  await expect(page.getByRole("link", { name: /יוסי בדיקה/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /דנה בדיקה/ })).toHaveCount(0);
});

test("follow-up: generate → guardrail → approve → WhatsApp draft → mark sent", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await page.getByRole("link", { name: /דנה בדיקה/ }).first().click();
  await page.getByRole("button", { name: "הכנת הודעת פולואפ" }).click();
  const box = page.locator("#fu-text");
  await expect(box).toHaveValue(/היי דנה, נועה מתכלת תיירות/);
  const original = await box.inputValue();
  expect(original).not.toMatch(/\d|₪|הנחה/);
  await expect(page.getByText("הצעד הבא:")).toBeVisible();

  // adding an unverified price blocks approval until explicitly confirmed
  await box.fill(original + " המחיר 4,500 ₪ ונשארו רק מקומות אחרונים");
  await expect(page.getByText(/מזכירה מחיר או מטבע/)).toBeVisible();
  await expect(page.getByText(/תחושת דחיפות/)).toBeVisible();
  await expect(page.getByRole("button", { name: "אישור ההודעה" })).toBeDisabled();

  await box.fill(original + "\nתודה!");
  await page.getByRole("button", { name: "אישור ההודעה" }).click();
  await expect(page.getByText("אושרה — מוכנה לשליחה")).toBeVisible();

  const wa = page.getByRole("link", { name: "פתיחה בוואטסאפ" });
  const href = await wa.getAttribute("href");
  expect(href).toContain("https://wa.me/972525550201?text=");
  expect(decodeURIComponent(href!.split("text=")[1])).toBe(original + "\nתודה!");
  await page.getByRole("button", { name: "העתקה" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original + "\nתודה!");

  await page.getByRole("button", { name: "שלחתי — לעדכן את הליד" }).click();
  await expect(page.getByText("הודעה סומנה כנשלחה")).toBeVisible();
  await expect(page.getByText("כבר יצרנו קשר היום")).toBeAttached();
});

test("status updates, waiting-for-quote view and audit trail", async ({ page }) => {
  await login(page);
  await page.goto("/leads?view=all&q=יוסי");
  await page.getByRole("link", { name: /יוסי בדיקה/ }).click();
  await page.getByRole("button", { name: /מחכה להצעה מעודכנת/ }).click();
  await expect(page.getByRole("button", { name: /מחכה להצעה מעודכנת/ })).toHaveAttribute("aria-pressed", "true");
  await page.locator("textarea#note").fill("ביקש לשנות מלון");
  await page.getByRole("button", { name: "הוספת הערה" }).click();
  await expect(page.getByText("ביקש לשנות מלון")).toBeVisible();
  await expect(page.getByText(/מחכה להצעה מעודכנת: לא ← כן/)).toBeVisible();

  await page.goto("/leads?view=waiting_quote");
  await expect(page.getByRole("link", { name: /יוסי בדיקה/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "מחכים להצעה מעודכנת" })).toBeVisible();

  await page.getByRole("link", { name: /יוסי בדיקה/ }).first().click();
  await page.getByRole("button", { name: "שלחתי הצעת מחיר" }).click();
  await expect(page.getByRole("button", { name: /מחכה להצעה מעודכנת/ })).toHaveAttribute("aria-pressed", "false");
});

test("profit: pending bookings do not count; confirmation needs a reference", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /דנה בדיקה/ }).first().click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "שמירת הזמנה" }) });
  await page.getByText("+ הזמנה חדשה").scrollIntoViewIfNeeded();
  if (!(await form.getByLabel("מחיר ללקוח").isVisible())) await page.getByText("+ הזמנה חדשה").click();
  await form.getByLabel("מחיר ללקוח").fill("9000");
  await form.getByLabel("עלות ספק").fill("8100");
  await expect(form.getByText(/רווח גולמי צפוי/)).toContainText("₪900");
  await form.getByRole("button", { name: "שמירת הזמנה" }).click();
  await expect(page.getByText("ההזמנה נשמרה. היא תיספר ברווח רק אחרי שתסומן")).toBeVisible();

  await page.goto("/profit");
  await expect(page.locator("main")).toContainText("ממתין לאישור");
  await expect(page.locator("main")).toContainText("1 הזמנות ממתינות לאישור עם רווח צפוי של");
  await expect(page.getByRole("region", { name: "סיכום ILS" })).toContainText("— 0");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /הזמנות שאושרו החודש/ })).toContainText("0");

  // confirm: blocked without supplier reference
  await page.getByRole("link", { name: /דנה בדיקה/ }).first().click();
  await page.locator("details", { hasText: "ממתין לאישור" }).first().locator("summary").click();
  const edit = page.locator("form").filter({ has: page.getByRole("button", { name: "עדכון הזמנה" }) });
  await edit.getByLabel("סטטוס הזמנה").selectOption("confirmed");
  await edit.getByRole("button", { name: "עדכון הזמנה" }).click();
  await expect(page.getByText("חובה להזין מספר אסמכתא מהספק")).toBeVisible();
  await edit.getByLabel("אסמכתא (Sky360)").fill("TEST-REF-1");
  await edit.getByLabel("רווח שהתקבל בפועל").fill("850");
  await edit.getByRole("button", { name: "עדכון הזמנה" }).click();
  await expect(page.getByText("ההזמנה נשמרה כמאושרת")).toBeVisible();
  await expect(page.locator("header").getByText("נסגר", { exact: true })).toBeVisible();

  await page.goto("/profit");
  const summary = page.getByRole("region", { name: "סיכום ILS" });
  await expect(summary).toContainText("₪9,000"); // revenue
  await expect(summary).toContainText("₪8,100"); // supplier cost
  await expect(summary).toContainText("₪900"); // expected profit
  await expect(summary).toContainText("₪850"); // actual profit — separate from revenue
  await page.goto("/");
  await expect(page.getByRole("link", { name: /רווח גולמי בפועל החודש/ })).toContainText("₪850");
  await expect(page.locator("main")).toContainText("1 לידים עם הזמנה מאושרת מתוך 4 לידים");
});

test("manual lead entry: validation keeps what was typed and blocks duplicate phones", async ({ page }) => {
  await login(page);
  await page.goto("/leads/new");
  await page.getByLabel("שם מלא *").fill("גיל ידני");
  await page.getByLabel("טלפון (וואטסאפ)").fill("123");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("יש שדות שדורשים תיקון")).toBeVisible();
  await expect(page.getByLabel("שם מלא *")).toHaveValue("גיל ידני");
  await page.getByLabel("טלפון (וואטסאפ)").fill("052 555 0201"); // same number as an imported lead
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("כבר קיים ליד עם מספר הטלפון הזה")).toBeVisible();
  await page.getByLabel("טלפון (וואטסאפ)").fill("052-555-0299");
  await page.getByLabel("יעד").fill("ליסבון");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("heading", { name: "גיל ידני" })).toBeVisible();
  await expect(page.getByText("פנייה חדשה שעוד לא קיבלה מענה").first()).toBeAttached();
});

test("owner can export a CSV backup; logout protects the app again", async ({ page }) => {
  await login(page);
  const res = await page.request.get("/api/export/leads");
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("דנה בדיקה");
  expect(csv).toContain("+972525550201");
  expect(csv).not.toContain("password");
  await page.goto("/settings");
  await page.getByRole("button", { name: "יציאה מהמערכת" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
