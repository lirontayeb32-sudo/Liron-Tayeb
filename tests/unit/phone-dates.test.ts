import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, whatsappLink } from "@/lib/phone";
import { addDays, daysBetween, nextBusinessDay, parseFlexibleDate, todayIL } from "@/lib/dates";

const e164 = (v: unknown) => {
  const r = normalizePhone(v);
  return r.ok ? r.e164 : null;
};

describe("normalizePhone", () => {
  it("normalizes every common way an Israeli mobile is written to one key", () => {
    const variants = [
      "054-123-4567",
      "0541234567",
      "054 123 4567",
      "+972541234567",
      "+972-54-123-4567",
      "972541234567",
      "00972541234567",
      "+972 (0)54 1234567",
      "541234567", // leading zero lost in Excel
      541234567,
      "541234567.0",
    ];
    for (const v of variants) expect(e164(v), String(v)).toBe("+972541234567");
  });

  it("handles landlines and foreign numbers", () => {
    expect(e164("03-5551234")).toBe("+97235551234");
    expect(e164("+1 (212) 555-0199")).toBe("+12125550199");
  });

  it("rejects junk", () => {
    for (const v of ["", null, undefined, "abc", "12345", "054-123", "05412345678"]) {
      expect(normalizePhone(v).ok, String(v)).toBe(false);
    }
  });

  it("formats for display and builds a WhatsApp draft link", () => {
    expect(formatPhone("+972541234567")).toBe("054-123-4567");
    expect(whatsappLink("+972541234567", "היי דנה")).toBe(
      "https://wa.me/972541234567?text=" + encodeURIComponent("היי דנה"),
    );
  });
});

describe("dates", () => {
  it("parses day-first formats", () => {
    expect(parseFlexibleDate("25/12/2026")).toBe("2026-12-25");
    expect(parseFlexibleDate("5.1.27")).toBe("2027-01-05");
    expect(parseFlexibleDate("2026-12-25")).toBe("2026-12-25");
    expect(parseFlexibleDate(new Date(Date.UTC(2026, 11, 25)))).toBe("2026-12-25");
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("בקיץ")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });

  it("does date math and skips the Israeli weekend", () => {
    expect(daysBetween("2026-11-16", "2026-11-20")).toBe(4);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(nextBusinessDay("2026-11-20")).toBe("2026-11-22"); // Friday → Sunday
    expect(nextBusinessDay("2026-11-21")).toBe("2026-11-22"); // Saturday → Sunday
    expect(nextBusinessDay("2026-11-22")).toBe("2026-11-22");
  });

  it("computes today in Israel time", () => {
    // 22:30 UTC on Nov 16 is already Nov 17 in Israel
    expect(todayIL(new Date("2026-11-16T22:30:00Z"))).toBe("2026-11-17");
  });
});
