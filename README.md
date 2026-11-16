# Tchelet Sales Engine · מנוע המכירות של תכלת תיירות

A Hebrew, right-to-left, mobile-first sales CRM for a travel agency. Every morning it answers:
who to contact today, why, what to say, who is waiting for an updated quote, which deals are
closest to closing, and how much profit has actually come in.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL (Supabase-compatible) · Zod.

## What it does

| Area | Details |
|---|---|
| CRM | Leads with destination, dates, passengers, budget, notes, follow-up date, consent / do-not-contact. Stages: NEW → QUALIFYING → QUOTED → FOLLOW_UP → READY_TO_BOOK → WON / LOST. Search (name, phone in any format, destination, notes), filters, sorting. |
| Import | CSV (UTF-8 or Windows-1255) and XLSX. Auto-maps Hebrew/English headers, **preview before anything is saved**, duplicate detection by normalized phone (in the file and against the database). Imports never overwrite existing data. |
| Priority score | Transparent 0–100 rule-based score; every point has a Hebrew explanation (`src/lib/scoring.ts`). It is a priority indicator, **not** a conversion probability, and the UI says so. Daily list of the 20 most actionable leads. |
| Follow-ups | For each lead: a short WhatsApp draft, next action, reason and next follow-up date. The owner edits and approves; then copy-to-clipboard or a `wa.me` draft link. **Nothing is ever sent automatically.** |
| Guardrails | Drafts never contain prices, discounts, urgency or availability claims. If the owner types one, approval requires an explicit "I verified this with the supplier" confirmation (enforced on the server too). Opted-out customers cannot get drafts at all. |
| Profit | Bookings with supplier cost, selling price, expected profit, **actual profit received**, reference, closing source, close date. Revenue and profit are separate. Only bookings explicitly marked *confirmed* (which requires a supplier reference) count. |
| Dashboard | New inquiries, hot leads, follow-ups due, quotes awaiting response, waiting for updated quote, bookings confirmed this month, actual gross profit, lead→booking conversion, top destinations. |
| Security | No public sign-up, scrypt password hashes, signed httpOnly session cookie, login rate limiting, row-level security on every table, append-only audit trail of every lead/booking change, owner-only export and delete. |

Sky360 is **not** accessed in any way. Costs, prices and booking references are typed in by hand.

## Local setup

Requirements: Node 20+, PostgreSQL 15+ (local, or a free Supabase project).

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and SESSION_SECRET
npm run db:migrate                # creates the schema (supabase/migrations/*.sql)
npm run user:create -- you@example.com "השם שלך" owner   # prompts for a password (min 10 chars)
npm run dev                       # http://localhost:3000
```

Optional: `npm run db:seed-demo` adds 13 **synthetic** leads to try the system;
`npm run db:seed-demo -- --clear` removes them again.

To use it from an iPhone on the same Wi-Fi during local testing: `npx next dev -H 0.0.0.0`
and open `http://<computer-ip>:3000`. (A production build sets a Secure cookie, so real phone
use needs the HTTPS deployment below.)

## Tests

```bash
npm test                                             # 32 unit tests (no database needed)
TEST_DATABASE_URL=postgres://…/tchelet_test npm run test:integration   # 9 DB tests: RLS, audit, constraints
E2E_DATABASE_URL=postgres://…/tchelet_test npm run test:e2e            # 8 browser tests, iPhone viewport
```

The integration and e2e suites **wipe the database they are given** and refuse to run unless
its name contains `test`. All test data is synthetic.

Last run in the build environment (PostgreSQL 16, Chromium): 32/32 unit, 9/9 integration,
8/8 end-to-end, `tsc` and `eslint` clean.

## Deployment (free tiers)

Not deployed yet — deploying and loading real customer data are your decision.

1. **Database – Supabase (free).** Create a project (choose an EU region). In *Connect*, copy the
   **Transaction pooler** URI. Run the migration from your computer:
   `DATABASE_URL='<uri>' npm run db:migrate`, then
   `DATABASE_URL='<uri>' npm run user:create -- you@example.com "השם שלך" owner`.
   The app does not use Supabase's REST API or anon key; RLS is enabled on all tables with no
   policy for `anon`/`authenticated`, so that API exposes nothing.
2. **App – Vercel.** Import this repository, set `DATABASE_URL`, `SESSION_SECRET`
   (`openssl rand -base64 48`) and `AGENCY_NAME` as environment variables, deploy.
   Vercel's free Hobby plan is for non-commercial use; for the agency use Pro, or any Node host
   (`npm run build && npm start`).
3. Open the URL on the iPhone → Share → *Add to Home Screen*.

Things to know:
- The migration was tested on plain PostgreSQL 16 with a non-superuser owner (the closest local
  equivalent of Supabase's `postgres` role). It has **not** yet been run against a real Supabase
  project; if `set role tchelet_app` is refused there, run `grant tchelet_app to postgres;` in the
  SQL editor.
- Free Supabase projects pause after about a week without activity and have no automatic backups.
- Keep `ANTHROPIC_API_KEY` empty unless you want paid AI rewording.

## Backup and export

- **In the app:** Settings → *ייצוא לידים* / *ייצוא הזמנות* (owner only). CSV files open in Excel.
  They contain personal data — store them securely.
- **Full database backup:** `pg_dump "$DATABASE_URL" --no-owner -Fc -f tchelet-$(date +%F).dump`
  (use Supabase's *Session* / direct connection string for `pg_dump`, not the transaction pooler).
  Restore with `pg_restore --no-owner -d "$NEW_DATABASE_URL" file.dump`.
- Suggested routine: CSV export weekly, `pg_dump` monthly and before every migration.

## Security model

- The browser never talks to the database and holds no keys. All queries run in server code.
- Each request runs in a transaction that switches to the unprivileged `tchelet_app` role and
  binds the acting user; RLS policies allow access only for an active user. The role cannot
  read password hashes, cannot modify users, and can only append to the audit log.
- `lead_events` records who changed what and when (database triggers, not application code).
- Changing a password or re-running `user:create` signs out all of that user's sessions.

## Project layout

```
supabase/migrations/   SQL schema, RLS policies, audit triggers
scripts/               migrate, create-user, seed-demo
src/lib/               scoring, followup, guardrails, import, phone, dates, auth, db, queries
src/app/actions/       server actions (validated with Zod)
src/app/(app)/         dashboard, leads, import, profit, settings
tests/ · e2e/          unit, database integration, browser end-to-end
```

## Not included yet

- Automatic WhatsApp sending / WhatsApp Business API (by design for this release).
- Sky360 integration (no documented API was used; data is entered manually).
- User management screen (users are created from the command line), password reset by e-mail, 2FA.
- Reading WhatsApp conversations — signals such as "asked about payment" are ticked by hand.
- Currency conversion: totals are shown per currency (₪ / $ / €), not combined.
- Reminders / push notifications, calendar sync, attachments, per-agent lead assignment.
- Editing or undoing an import batch as a whole; importing bookings.
- The optional AI rewording path is implemented but was not exercised against the live API here.
