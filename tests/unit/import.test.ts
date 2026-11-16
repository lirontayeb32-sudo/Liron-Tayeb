import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { readSheet } from "read-excel-file/node";
import { buildPreview, normalizeRow, suggestMapping } from "@/lib/import";
import { decodeCsvBytes, parseCsvText, serializeRows, tableFromRows } from "@/lib/import-parse";
import { bookingSchema, leadSchema } from "@/lib/schemas";

const CSV = `שם מלא,טלפון,יעד,תאריך יציאה,תאריך חזרה,נוסעים,תקציב,סטטוס,הערות,הסכמה
דנה בדיקה,054-1234567,רומא,10/02/2027,15/02/2027,2,"8,000 ₪",נשלחה הצעה,מעדיפה טיסת בוקר,כן
יוסי דוגמה,541234568,יוון,5.6.27,,4,3000$,חדש,,
דנה כפולה,+972541234567,פריז,,,,,,,
בלי טלפון,,לונדון,,,,,,,
רון סירוב,052-7654321,דובאי,שבוע הבא,,הרבה,,לא ידוע,,לא
,,,,,,,,,
`;

describe("CSV parsing + mapping", () => {
  const table = parseCsvText(CSV);
  const mapping = suggestMapping(table.headers);

  it("detects Hebrew headers", () => {
    expect(table.headers[0]).toBe("שם מלא");
    expect(table.rows).toHaveLength(5); // blank row dropped
    expect(mapping.full_name).toBe(0);
    expect(mapping.phone).toBe(1);
    expect(mapping.destination).toBe(2);
    expect(mapping.depart_date).toBe(3);
    expect(mapping.return_date).toBe(4);
    expect(mapping.passengers).toBe(5);
    expect(mapping.budget_amount).toBe(6);
    expect(mapping.stage).toBe(7);
    expect(mapping.notes).toBe(8);
    expect(mapping.consent).toBe(9);
    expect(mapping.email).toBe(-1);
  });

  it("detects English headers", () => {
    const m = suggestMapping(["Name", "Phone Number", "E-mail", "Destination", "Departure", "Return", "Pax", "Budget", "Status", "Notes"]);
    expect([m.full_name, m.phone, m.email, m.destination, m.depart_date, m.return_date, m.passengers, m.budget_amount, m.stage, m.notes]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("normalizes a full row", () => {
    const { lead, errors, warnings } = normalizeRow(table.rows[0], mapping);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(lead).toMatchObject({
      full_name: "דנה בדיקה",
      phone_e164: "+972541234567",
      destination: "רומא",
      depart_date: "2027-02-10",
      return_date: "2027-02-15",
      passengers: 2,
      budget_amount: 8000,
      budget_currency: "ILS",
      stage: "QUOTED",
      notes: "מעדיפה טיסת בוקר",
      consent: "granted",
      do_not_contact: false,
    });
  });

  it("classifies new / duplicate-in-file / duplicate-in-db / error rows", () => {
    const existing = new Map([["+972527654321", { id: "x", full_name: "רון קיים" }]]);
    const preview = buildPreview(table.rows, mapping, existing);
    expect(preview.map((r) => r.status)).toEqual(["new", "new", "duplicate_file", "error", "duplicate_db"]);
    expect(preview[1].lead).toMatchObject({ phone_e164: "+972541234568", budget_currency: "USD", budget_amount: 3000, depart_date: "2027-06-05" });
    expect(preview[3].errors.join()).toContain("טלפון");
    expect(preview[4].existing?.full_name).toBe("רון קיים");
    // unreadable values become warnings, never silent garbage
    expect(preview[4].warnings.length).toBe(3);
    expect(preview[4].lead).toMatchObject({ depart_date: null, passengers: null, stage: "NEW", consent: "denied", do_not_contact: true });
  });

  it("decodes Windows-1255 files exported from Hebrew Excel", () => {
    // "שם,טלפון" in Windows-1255
    const bytes = new Uint8Array([0xf9, 0xed, 0x2c, 0xe8, 0xec, 0xf4, 0xe5, 0xef]);
    expect(decodeCsvBytes(bytes)).toBe("שם,טלפון");
    expect(decodeCsvBytes(new TextEncoder().encode("שם,טלפון"))).toBe("שם,טלפון");
  });
});

describe("XLSX parsing", () => {
  it("reads a real .xlsx file, including date cells and numeric phones", async () => {
    const buffer = await writeXlsxFile(
      [
        [{ value: "שם" }, { value: "נייד" }, { value: "יעד" }, { value: "תאריך יציאה" }],
        [
          { value: "מיכל אקסל" },
          { value: 541112233, type: Number },
          { value: "ברצלונה" },
          { value: new Date(Date.UTC(2027, 3, 12)), type: Date, format: "dd/mm/yyyy" },
        ],
      ],
    ).toBuffer();
    const data = await readSheet(buffer);
    const table = tableFromRows(data as never);
    const mapping = suggestMapping(table.headers);
    const rows = serializeRows(table.rows);
    const preview = buildPreview(rows, mapping, new Map());
    expect(preview[0].status).toBe("new");
    expect(preview[0].lead).toMatchObject({
      full_name: "מיכל אקסל",
      phone_e164: "+972541112233",
      destination: "ברצלונה",
      depart_date: "2027-04-12",
    });
  });
});

describe("form validation", () => {
  it("validates a lead form", () => {
    const ok = leadSchema.safeParse({ full_name: " דנה ", phone: "054-1234567", passengers: "2", budget_amount: "8,000", do_not_contact: "on", email: "" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data).toMatchObject({ full_name: "דנה", passengers: 2, budget_amount: 8000, do_not_contact: true, email: null, stage: "NEW" });
    }
    expect(leadSchema.safeParse({ full_name: "" }).success).toBe(false);
    expect(leadSchema.safeParse({ full_name: "א", phone: "123" }).success).toBe(false);
    expect(leadSchema.safeParse({ full_name: "א", depart_date: "2027-02-10", return_date: "2027-02-01" }).success).toBe(false);
    expect(leadSchema.safeParse({ full_name: "א", stage: "HACKED" }).success).toBe(false);
  });

  it("requires a supplier reference before a booking can be confirmed", () => {
    const base = { supplier_cost: "5000", selling_price: "5600" };
    expect(bookingSchema.safeParse({ ...base, status: "pending" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, status: "confirmed" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, status: "confirmed", booking_reference: "SKY-123" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, selling_price: "-1" }).success).toBe(false);
  });
});
