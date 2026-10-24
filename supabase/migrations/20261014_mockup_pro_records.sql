-- Mockup Pro: shared data for the customer and shop sides.
-- One row per customer, order and artwork, holding the app's own JSON shape
-- (lib/demo/types.ts). Only the server (service key) reads or writes; browsers
-- go through Mockup Pro's /api routes, which check the shop password or the
-- customer's own session cookie.
-- Safe to run twice. Lives in the shared "Mock up pro" project next to the
-- Job Board's tables; every name here starts with mp_ to stay out of their way.

create table if not exists public.mp_records (
  kind text not null check (kind in ('customer', 'order', 'asset')),
  id text not null,
  customer_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create index if not exists mp_records_customer on public.mp_records (customer_id);

alter table public.mp_records enable row level security;
-- No policies on purpose: anon and signed-in browser keys get nothing.

-- File and order numbers, handed out by the server so two devices never clash.
create sequence if not exists public.mp_file_no start 1003;
create sequence if not exists public.mp_order_no start 1043;

create or replace function public.mp_next_no(which text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select case which
    when 'file' then nextval('public.mp_file_no')
    when 'order' then nextval('public.mp_order_no')
  end;
$$;

revoke all on function public.mp_next_no(text) from public, anon, authenticated;
grant execute on function public.mp_next_no(text) to service_role;

-- Customer artwork. Public read by unguessable URL (random ids), so the live
-- mockup can draw it; uploads only through server-signed upload links.
insert into storage.buckets (id, name, public)
values ('mockup-art', 'mockup-art', true)
on conflict (id) do nothing;
