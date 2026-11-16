/** CSV decoding/parsing for the importer (runs in the browser and in tests). */
import Papa from "papaparse";
import { isBlankRow, MAX_IMPORT_ROWS, type RawCell } from "./import";

export interface ParsedTable {
  headers: string[];
  rows: RawCell[][];
  truncated: boolean;
}

/**
 * Israeli spreadsheets are often saved as Windows-1255 rather than UTF-8.
 * Try strict UTF-8 first and fall back to Windows-1255.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}

export function parseCsvText(text: string): ParsedTable {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
  });
  return tableFromRows(result.data as RawCell[][]);
}

/** First non-blank row is the header; blank rows are dropped. */
export function tableFromRows(all: RawCell[][]): ParsedTable {
  const rows = all.filter((r) => Array.isArray(r) && !isBlankRow(r));
  if (!rows.length) return { headers: [], rows: [], truncated: false };
  const headers = rows[0].map((c) => (c === null || c === undefined ? "" : String(c).trim()));
  const body = rows.slice(1);
  return {
    headers,
    rows: body.slice(0, MAX_IMPORT_ROWS),
    truncated: body.length > MAX_IMPORT_ROWS,
  };
}

/** Makes a parsed table safe to send to a server action (Dates → ISO strings). */
export function serializeRows(rows: RawCell[][]): Array<Array<string | number | boolean | null>> {
  return rows.map((r) =>
    r.map((c) => {
      if (c === undefined || c === null) return null;
      if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
      return c;
    }),
  );
}
