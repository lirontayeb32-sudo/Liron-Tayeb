"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import type { Lead } from "@/lib/types";
import { buildPreview, IMPORT_FIELDS, MAX_IMPORT_ROWS, type ColumnMapping, type PreviewRow } from "@/lib/import";

const cell = z.union([z.string().max(6000), z.number(), z.boolean(), z.null()]);
const payloadSchema = z.object({
  rows: z.array(z.array(cell).max(100)).min(1, "הקובץ ריק").max(MAX_IMPORT_ROWS),
  mapping: z.object(
    Object.fromEntries(IMPORT_FIELDS.map((f) => [f, z.number().int().min(-1).max(99)])) as Record<
      (typeof IMPORT_FIELDS)[number],
      z.ZodNumber
    >,
  ),
});

export interface PreviewResult {
  ok: boolean;
  error?: string;
  rows?: PreviewRow[];
  counts?: Record<PreviewRow["status"], number>;
}

async function preview(userId: string, rows: unknown, mapping: unknown) {
  const parsed = payloadSchema.safeParse({ rows, mapping });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "קובץ לא תקין" } as const;
  const m = parsed.data.mapping as ColumnMapping;
  if (m.full_name < 0 || m.phone < 0) return { error: "חובה לשייך עמודת שם ועמודת טלפון" } as const;

  // First pass without DB knowledge just to collect the normalized phone numbers.
  const phones = buildPreview(parsed.data.rows, m, new Map())
    .map((r) => r.lead?.phone_e164)
    .filter((p): p is string => Boolean(p));
  const existing = await withUser(userId, async (tx) => {
    const found = await tx<Array<{ id: string; full_name: string; phone_e164: string }>>`
      select id, full_name, phone_e164 from leads where phone_e164 = any(${phones})`;
    return [...found];
  });
  const map = new Map(existing.map((e) => [e.phone_e164, { id: e.id, full_name: e.full_name }]));
  return { rows: buildPreview(parsed.data.rows, m, map), mapping: m } as const;
}

function count(rows: PreviewRow[]) {
  const counts = { new: 0, duplicate_db: 0, duplicate_file: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

/** Step 1 — nothing is written. Returns how every row would be treated. */
export async function previewImportAction(rows: unknown, mapping: unknown): Promise<PreviewResult> {
  const user = await requireUser();
  const result = await preview(user.id, rows, mapping);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, rows: result.rows, counts: count(result.rows) };
}

export interface CommitResult {
  ok: boolean;
  error?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
}

/**
 * Step 2 — commit. The server recomputes the preview from the raw rows (the client's preview
 * is never trusted). Duplicates are skipped, or — with `fillEmpty` — only fill fields that are
 * still empty on the existing lead. Existing data is never overwritten by an import.
 */
export async function commitImportAction(
  rows: unknown,
  mapping: unknown,
  filename: string,
  fillEmpty: boolean,
): Promise<CommitResult> {
  const user = await requireUser();
  const result = await preview(user.id, rows, mapping);
  if ("error" in result) return { ok: false, error: result.error };
  const counts = count(result.rows);

  const outcome = await withUser(user.id, async (tx) => {
    const [batch] = await tx<Array<{ id: string }>>`
      insert into import_batches (filename, total_rows, created_by)
      values (${String(filename).slice(0, 200)}, ${result.rows.length}, ${user.id}) returning id`;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of result.rows) {
      const l = row.lead;
      if (row.status === "error" || !l) continue;
      if (row.status === "new") {
        // `on conflict do nothing` also covers a lead created by someone else since the preview.
        const res = await tx`
          insert into leads ${tx({
            ...l,
            quote_sent_at: l.stage === "QUOTED" ? new Date() : null,
            import_batch_id: batch.id,
            created_by: user.id,
          })}
          on conflict (phone_e164) do nothing`;
        if (res.count) inserted++;
        else skipped++;
      } else if (row.status === "duplicate_db" && fillEmpty && row.existing) {
        const [cur] = await tx<Lead[]>`select * from leads where id = ${row.existing.id} for update`;
        const patch: Record<string, string | number | boolean> = {};
        if (cur) {
          for (const f of ["email", "destination", "depart_date", "passengers", "budget_amount", "source", "notes"] as const) {
            const incoming = l[f];
            if ((cur[f] === null || cur[f] === "") && incoming !== null) patch[f] = incoming;
          }
          const depart = (patch.depart_date as string | undefined) ?? cur.depart_date;
          if (!cur.return_date && l.return_date && (!depart || l.return_date >= depart)) patch.return_date = l.return_date;
          // An opt-out in the file is always honoured; consent is never upgraded by an import.
          if (l.consent === "denied" && cur.consent !== "denied") patch.consent = "denied";
          if (l.do_not_contact && !cur.do_not_contact) patch.do_not_contact = true;
        }
        const res = Object.keys(patch).length
          ? await tx`update leads set ${tx(patch)} where id = ${row.existing.id}`
          : { count: 0 };
        if (res.count) updated++;
        else skipped++;
      } else {
        skipped++;
      }
    }
    await tx`update import_batches set inserted_rows = ${inserted}, updated_rows = ${updated},
             skipped_rows = ${skipped}, error_rows = ${counts.error} where id = ${batch.id}`;
    return { inserted, updated, skipped };
  });

  revalidatePath("/", "layout");
  return { ok: true, ...outcome, errors: counts.error };
}
