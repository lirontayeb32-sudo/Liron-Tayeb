-- Tchelet Sales Engine — initial schema
-- Runs on plain PostgreSQL 15+ and on Supabase (SQL editor or `npm run db:migrate`).
--
-- Security model
--   * The web app connects with the database owner connection string (server-side only).
--   * Every business query runs inside a transaction that does
--       SET LOCAL ROLE tchelet_app;  set_config('app.user_id', <uuid>, true)
--     so row-level security applies and only an *active* app user can read or write.
--   * RLS is enabled on every table with no policy for Supabase's `anon` / `authenticated`
--     roles, so the auto-generated Supabase REST API exposes nothing.
--   * lead_events is append-only for the app role (audit trail).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tchelet_app') then
    create role tchelet_app nologin noinherit;
  end if;
end $$;

-- Allow the migrating/connecting role to `SET ROLE tchelet_app`.
do $$
begin
  execute format('grant tchelet_app to %I', current_user);
exception when others then
  raise notice 'grant tchelet_app to current_user skipped: %', sqlerrm;
end $$;

create schema if not exists app;
grant usage on schema app to tchelet_app;
grant usage on schema public to tchelet_app;

-- ───────────────────────────── enums ─────────────────────────────
create type lead_stage as enum
  ('NEW','QUALIFYING','QUOTED','FOLLOW_UP','READY_TO_BOOK','WON','LOST');
create type consent_status as enum ('unknown','granted','denied');
create type booking_status as enum ('pending','confirmed','cancelled');
create type user_role as enum ('owner','agent');
create type message_status as enum ('draft','approved','sent_manually','discarded');

-- ───────────────────────────── users ─────────────────────────────
create table app_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  name            text not null,
  password_hash   text not null,
  role            user_role not null default 'agent',
  active          boolean not null default true,
  session_version integer not null default 1,
  created_at      timestamptz not null default now()
);
create unique index app_users_email_key on app_users (lower(email));

create table login_attempts (
  id         bigint generated always as identity primary key,
  email      text not null,
  ip         text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_lookup on login_attempts (lower(email), created_at desc);

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from app_users u where u.id = app.current_user_id() and u.active
  )
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from app_users u
    where u.id = app.current_user_id() and u.active and u.role = 'owner'
  )
$$;

-- ───────────────────────────── import batches ─────────────────────────────
create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  filename       text,
  total_rows     integer not null default 0,
  inserted_rows  integer not null default 0,
  updated_rows   integer not null default 0,
  skipped_rows   integer not null default 0,
  error_rows     integer not null default 0,
  created_by     uuid references app_users(id),
  created_at     timestamptz not null default now()
);

-- ───────────────────────────── leads ─────────────────────────────
create table leads (
  id                       uuid primary key default gen_random_uuid(),
  full_name                text not null check (length(btrim(full_name)) > 0),
  phone_raw                text,
  phone_e164               text unique,             -- normalized; duplicate detection key
  email                    text,
  destination              text,
  depart_date              date,
  return_date              date,
  dates_note               text,
  passengers               integer check (passengers is null or passengers between 1 and 500),
  budget_amount            numeric(12,2) check (budget_amount is null or budget_amount >= 0),
  budget_currency          text not null default 'ILS' check (budget_currency in ('ILS','USD','EUR')),
  stage                    lead_stage not null default 'NEW',
  source                   text,
  notes                    text,
  follow_up_date           date,
  consent                  consent_status not null default 'unknown',
  do_not_contact           boolean not null default false,
  -- sales signals (set by the agent, used by the transparent priority score)
  booking_intent           boolean not null default false,
  payment_question         boolean not null default false,
  waiting_for_our_reply    boolean not null default false,
  waiting_for_quote_update boolean not null default false,
  quote_sent_at            timestamptz,
  last_customer_reply_at   timestamptz,
  last_contacted_at        timestamptz,
  lost_reason              text,
  import_batch_id          uuid references import_batches(id) on delete set null,
  created_by               uuid references app_users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (return_date is null or depart_date is null or return_date >= depart_date)
);
create index leads_stage_idx on leads (stage);
create index leads_follow_up_idx on leads (follow_up_date) where follow_up_date is not null;
create index leads_created_idx on leads (created_at desc);

-- ───────────────────────────── bookings ─────────────────────────────
-- Revenue (selling_price) and profit are kept separate.
-- Nothing counts as won revenue/profit until status = 'confirmed'.
create table bookings (
  id                     uuid primary key default gen_random_uuid(),
  lead_id                uuid not null references leads(id) on delete restrict,
  status                 booking_status not null default 'pending',
  booking_reference      text,
  supplier               text not null default 'Sky360',
  currency               text not null default 'ILS' check (currency in ('ILS','USD','EUR')),
  supplier_cost          numeric(12,2) not null check (supplier_cost >= 0),
  selling_price          numeric(12,2) not null check (selling_price >= 0),
  expected_profit        numeric(12,2) generated always as (selling_price - supplier_cost) stored,
  actual_profit_received numeric(12,2),          -- entered explicitly once money actually arrived
  follow_up_source       text,
  closed_at              date,
  confirmed_at           timestamptz,
  notes                  text,
  created_by             uuid references app_users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (status <> 'confirmed' or closed_at is not null)
);
create index bookings_lead_idx on bookings (lead_id);
create index bookings_status_idx on bookings (status, closed_at);

-- ───────────────────────────── follow-up messages ─────────────────────────────
create table followup_messages (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references leads(id) on delete cascade,
  body               text not null,
  status             message_status not null default 'draft',
  scenario           text not null,
  suggested_action   text not null,
  reason             text not null,
  next_follow_up     date,
  generator          text not null default 'template' check (generator in ('template','ai')),
  created_by         uuid references app_users(id),
  approved_by        uuid references app_users(id),
  approved_at        timestamptz,
  marked_sent_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index followup_messages_lead_idx on followup_messages (lead_id, created_at desc);

-- ───────────────────────────── audit trail ─────────────────────────────
create table lead_events (
  id         bigint generated always as identity primary key,
  lead_id    uuid,                 -- no FK: history survives lead deletion
  user_id    uuid,
  type       text not null,        -- lead_created | lead_updated | lead_deleted | note |
                                   -- booking_created | booking_updated | message_approved | message_sent
  changes    jsonb,                -- { field: { from, to } }
  body       text,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events (lead_id, created_at desc);

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.jsonb_changes(old_row jsonb, new_row jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(new_row) n
  join jsonb_each(old_row) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at')
$$;

create or replace function app.audit_lead() returns trigger
language plpgsql as $$
declare diff jsonb;
begin
  if tg_op = 'INSERT' then
    insert into lead_events (lead_id, user_id, type, changes)
    values (new.id, app.current_user_id(), 'lead_created',
            jsonb_build_object('stage', jsonb_build_object('from', null, 'to', new.stage)));
    return new;
  elsif tg_op = 'UPDATE' then
    diff := app.jsonb_changes(to_jsonb(old), to_jsonb(new));
    if diff <> '{}'::jsonb then
      insert into lead_events (lead_id, user_id, type, changes)
      values (new.id, app.current_user_id(), 'lead_updated', diff);
    end if;
    return new;
  else
    insert into lead_events (lead_id, user_id, type, changes)
    values (old.id, app.current_user_id(), 'lead_deleted',
            jsonb_build_object('full_name', old.full_name, 'phone_e164', old.phone_e164));
    return old;
  end if;
end $$;

create or replace function app.audit_booking() returns trigger
language plpgsql as $$
declare diff jsonb;
begin
  if tg_op = 'INSERT' then
    insert into lead_events (lead_id, user_id, type, changes)
    values (new.lead_id, app.current_user_id(), 'booking_created',
            jsonb_build_object('booking_id', new.id, 'status', new.status,
                               'selling_price', new.selling_price, 'supplier_cost', new.supplier_cost,
                               'currency', new.currency));
  else
    diff := app.jsonb_changes(to_jsonb(old), to_jsonb(new));
    if diff <> '{}'::jsonb then
      insert into lead_events (lead_id, user_id, type, changes)
      values (new.lead_id, app.current_user_id(), 'booking_updated',
              diff || jsonb_build_object('booking_id', new.id));
    end if;
  end if;
  return new;
end $$;

create trigger leads_touch before update on leads
  for each row execute function app.touch_updated_at();
create trigger bookings_touch before update on bookings
  for each row execute function app.touch_updated_at();
create trigger followup_touch before update on followup_messages
  for each row execute function app.touch_updated_at();
create trigger leads_audit after insert or update or delete on leads
  for each row execute function app.audit_lead();
create trigger bookings_audit after insert or update on bookings
  for each row execute function app.audit_booking();

-- ───────────────────────────── privileges + RLS ─────────────────────────────
grant select, insert, update, delete on leads to tchelet_app;
grant select, insert, update on bookings, followup_messages to tchelet_app;
grant select, insert on lead_events, import_batches to tchelet_app;
grant update on import_batches to tchelet_app;
-- column-level: the app role can never read password hashes
grant select (id, email, name, role, active, created_at) on app_users to tchelet_app;
grant usage on all sequences in schema public to tchelet_app;
grant execute on all functions in schema app to tchelet_app;

alter table app_users         enable row level security;
alter table login_attempts    enable row level security;
alter table import_batches    enable row level security;
alter table leads             enable row level security;
alter table bookings          enable row level security;
alter table followup_messages enable row level security;
alter table lead_events       enable row level security;

create policy users_read on app_users for select to tchelet_app
  using (app.is_active_user());

create policy leads_select on leads for select to tchelet_app using (app.is_active_user());
create policy leads_insert on leads for insert to tchelet_app with check (app.is_active_user());
create policy leads_update on leads for update to tchelet_app
  using (app.is_active_user()) with check (app.is_active_user());
create policy leads_delete on leads for delete to tchelet_app using (app.is_owner());

create policy bookings_all on bookings for all to tchelet_app
  using (app.is_active_user()) with check (app.is_active_user());
create policy messages_all on followup_messages for all to tchelet_app
  using (app.is_active_user()) with check (app.is_active_user());
create policy batches_all on import_batches for all to tchelet_app
  using (app.is_active_user()) with check (app.is_active_user());
create policy events_select on lead_events for select to tchelet_app using (app.is_active_user());
create policy events_insert on lead_events for insert to tchelet_app with check (app.is_active_user());

-- Supabase API roles get nothing (defense in depth; RLS already blocks them).
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on schema app from %I', r);
    end if;
  end loop;
end $$;
