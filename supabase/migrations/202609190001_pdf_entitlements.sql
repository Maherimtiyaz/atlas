create table if not exists public.pdf_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_downloads_used integer not null default 0 check (free_downloads_used between 0 and 1),
  paid_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pdf_download_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('reserved', 'completed', 'failed')),
  consumes_free_download boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

alter table public.pdf_entitlements enable row level security;
alter table public.pdf_download_reservations enable row level security;

create policy "Users can read their PDF entitlement"
  on public.pdf_entitlements for select
  using (auth.uid() = user_id);

create policy "Users can read their PDF reservations"
  on public.pdf_download_reservations for select
  using (auth.uid() = user_id);

create or replace function public.reserve_pdf_download(request_key text)
returns table (reservation_id uuid, reservation_status text, paid_access boolean, consumes_free_download boolean, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  entitlement public.pdf_entitlements;
  existing public.pdf_download_reservations;
  new_reservation uuid;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  if request_key is null or length(request_key) < 16 or length(request_key) > 128 then raise exception 'invalid_idempotency_key'; end if;

  select * into existing
    from public.pdf_download_reservations
    where user_id = current_user_id and idempotency_key = request_key
    for update;
  if existing.id is not null then
    if existing.status = 'reserved' and existing.expires_at < now() then
      update public.pdf_download_reservations
        set status = 'failed', completed_at = now()
        where id = existing.id;
      if existing.consumes_free_download then
        update public.pdf_entitlements
          set free_downloads_used = 0, updated_at = now()
          where user_id = current_user_id and free_downloads_used = 1 and not paid_access;
    else
      return query select existing.id, existing.status, false, existing.consumes_free_download, false;
      return;
    end if;
  end if;

  insert into public.pdf_entitlements(user_id)
    values (current_user_id)
    on conflict (user_id) do nothing;
  select * into entitlement from public.pdf_entitlements where user_id = current_user_id for update;

  if not entitlement.paid_access and entitlement.free_downloads_used >= 1 then
    raise exception 'paid_access_required';
  end if;

  if entitlement.paid_access then
    insert into public.pdf_download_reservations(user_id, idempotency_key, status)
      values (current_user_id, request_key, 'reserved') returning id into new_reservation;
  else
    update public.pdf_entitlements
      set free_downloads_used = 1, updated_at = now()
      where user_id = current_user_id;
    insert into public.pdf_download_reservations(user_id, idempotency_key, status, consumes_free_download)
      values (current_user_id, request_key, 'reserved', true) returning id into new_reservation;
  end if;

  return query select new_reservation, 'reserved'::text, entitlement.paid_access, not entitlement.paid_access, true;
end;
$$;

create or replace function public.complete_pdf_download(reservation uuid)
returns void language sql security definer set search_path = public as $$
  update public.pdf_download_reservations
  set status = 'completed', completed_at = now()
  where id = reservation and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.fail_pdf_download(reservation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  failed public.pdf_download_reservations;
begin
  update public.pdf_download_reservations
    set status = 'failed', completed_at = now()
    where id = reservation and user_id = auth.uid() and status = 'reserved'
    returning * into failed;
  if failed.id is not null and failed.consumes_free_download then
    update public.pdf_entitlements
      set free_downloads_used = 0, updated_at = now()
      where user_id = auth.uid() and free_downloads_used = 1 and not paid_access;
  end if;
end;
$$;

revoke all on function public.reserve_pdf_download(text) from public;
revoke all on function public.complete_pdf_download(uuid) from public;
revoke all on function public.fail_pdf_download(uuid) from public;
grant execute on function public.reserve_pdf_download(text) to authenticated;
grant execute on function public.complete_pdf_download(uuid) to authenticated;
grant execute on function public.fail_pdf_download(uuid) to authenticated;