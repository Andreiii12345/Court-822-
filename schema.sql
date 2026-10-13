-- Court 822 database setup
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','owner')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role) values (new.id, 'customer') on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  morning_rate numeric(10,2) not null default 400,
  afternoon_rate numeric(10,2) not null default 500,
  evening_rate numeric(10,2) not null default 650,
  open_play_fee numeric(10,2) not null default 250,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.court_days (
  id bigint generated always as identity primary key,
  date date not null unique,
  mode text not null default 'regular' check (mode in ('regular','open_play','closed')),
  open_start_time time default '18:00',
  open_end_time time default '22:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.time_slots (
  id bigint generated always as identity primary key,
  start_time time not null,
  end_time time not null,
  rate_key text not null check (rate_key in ('morning','afternoon','evening')),
  active boolean not null default true,
  unique (start_time, end_time)
);

insert into public.time_slots (start_time,end_time,rate_key) values
('07:00','08:00','morning'),('09:00','10:00','morning'),
('11:00','12:00','afternoon'),('13:00','14:00','afternoon'),('15:00','16:00','afternoon'),
('17:00','18:00','evening'),('19:00','20:00','evening'),('21:00','22:00','evening')
on conflict (start_time,end_time) do nothing;

create table if not exists public.open_play_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null unique,
  start_time time not null default '18:00',
  end_time time not null default '22:00',
  fee numeric(10,2) not null default 250,
  max_players integer not null default 40 check (max_players between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  mobile_number text not null,
  booking_date date not null,
  booking_type text not null check (booking_type in ('regular','open_play')),
  slot_id bigint references public.time_slots(id),
  event_id uuid references public.open_play_events(id),
  court_number integer check (court_number between 1 and 4),
  player_count integer not null default 1 check (player_count between 1 and 40),
  total_amount numeric(10,2) not null default 0,
  paid_amount numeric(10,2) not null default 0 check (paid_amount >= 0),
  remaining_balance numeric(10,2) generated always as (greatest(total_amount - paid_amount, 0)) stored,
  payment_status text not null default 'unpaid' check (payment_status in ('paid','unpaid','partial')),
  booking_status text not null default 'pending' check (booking_status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_booking_per_court_slot
on public.bookings (booking_date, slot_id, court_number)
where booking_type = 'regular' and booking_status in ('pending','confirmed');

create table if not exists public.open_play_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.open_play_events(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  player_name text not null,
  games_played integer not null default 0,
  last_round_played integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.open_play_rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.open_play_events(id) on delete cascade,
  round_number integer not null,
  created_at timestamptz not null default now(),
  unique (event_id, round_number)
);

create table if not exists public.round_assignments (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.open_play_rounds(id) on delete cascade,
  court_number integer not null check (court_number between 1 and 4),
  player_id uuid not null references public.open_play_players(id) on delete cascade,
  seat_number integer not null check (seat_number between 1 and 4),
  unique (round_id, player_id),
  unique (round_id, court_number, seat_number)
);

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.sync_payment_status()
returns trigger language plpgsql as $$
begin
  if new.paid_amount <= 0 then new.payment_status := 'unpaid';
  elsif new.paid_amount >= new.total_amount then new.paid_amount := new.total_amount; new.payment_status := 'paid';
  else new.payment_status := 'partial';
  end if;
  return new;
end; $$;

drop trigger if exists bookings_sync_payment_status on public.bookings;
create trigger bookings_sync_payment_status before insert or update of paid_amount,total_amount on public.bookings for each row execute procedure public.sync_payment_status();

create or replace view public.open_play_public as
select e.id as event_id,e.event_date,e.start_time,e.end_time,e.fee,e.max_players,
       count(p.id)::integer as joined
from public.open_play_events e
left join public.open_play_players p on p.event_id=e.id
where e.active=true
group by e.id;

create or replace function public.public_create_booking(
  p_customer_name text,p_mobile_number text,p_booking_date date,p_slot_id bigint,p_player_count integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_mode text; v_rate_key text; v_price numeric; v_court integer; v_id uuid;
begin
  select mode into v_mode from public.court_days where date=p_booking_date;
  if v_mode is distinct from 'regular' then raise exception 'This date is not available for regular booking'; end if;
  if p_player_count < 1 or p_player_count > 4 then raise exception 'A regular court booking allows 1 to 4 players'; end if;
  select rate_key into v_rate_key from public.time_slots where id=p_slot_id and active=true;
  if v_rate_key is null then raise exception 'Invalid time slot'; end if;
  select case v_rate_key when 'morning' then morning_rate when 'afternoon' then afternoon_rate else evening_rate end into v_price from public.site_settings where id=1;
  for v_court in 1..4 loop
    exit when not exists(select 1 from public.bookings where booking_date=p_booking_date and slot_id=p_slot_id and court_number=v_court and booking_status in ('pending','confirmed'));
  end loop;
  if v_court > 4 or exists(select 1 from public.bookings where booking_date=p_booking_date and slot_id=p_slot_id and court_number=v_court and booking_status in ('pending','confirmed')) then raise exception 'All four courts are already booked for this time'; end if;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,slot_id,court_number,player_count,total_amount)
  values(trim(p_customer_name),trim(p_mobile_number),p_booking_date,'regular',p_slot_id,v_court,p_player_count,v_price) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.public_join_open_play(p_event_id uuid,p_customer_name text,p_mobile_number text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event public.open_play_events%rowtype; v_count integer; v_booking uuid;
begin
  select * into v_event from public.open_play_events where id=p_event_id and active=true for update;
  if not found then raise exception 'Open Play event not found'; end if;
  select count(*) into v_count from public.open_play_players where event_id=p_event_id;
  if v_count >= v_event.max_players then raise exception 'This Open Play session is already full'; end if;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,event_id,player_count,total_amount)
  values(trim(p_customer_name),trim(p_mobile_number),v_event.event_date,'open_play',p_event_id,1,v_event.fee) returning id into v_booking;
  insert into public.open_play_players(event_id,booking_id,player_name) values(p_event_id,v_booking,trim(p_customer_name));
  return v_booking;
end; $$;

create or replace function public.owner_create_next_round(p_event_id uuid)
returns table(round_number integer,court_number integer,player_id uuid,player_name text,games_played integer)
language plpgsql security definer set search_path = public as $$
declare v_round integer; v_round_id uuid;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  select coalesce(max(r.round_number),0)+1 into v_round from public.open_play_rounds r where r.event_id=p_event_id;
  insert into public.open_play_rounds(event_id,round_number) values(p_event_id,v_round) returning id into v_round_id;
  with chosen as (
    select p.id,row_number() over(order by p.games_played asc,(p.last_round_played=v_round-1) asc,random()) as n
    from public.open_play_players p where p.event_id=p_event_id order by p.games_played asc,(p.last_round_played=v_round-1) asc,random() limit 16
  )
  insert into public.round_assignments(round_id,court_number,player_id,seat_number)
  select v_round_id,((n-1)/4)+1,id,((n-1)%4)+1 from chosen;
  update public.open_play_players p set games_played=p.games_played+1,last_round_played=v_round
  where p.id in(select a.player_id from public.round_assignments a where a.round_id=v_round_id);
  return query select v_round,a.court_number,p.id,p.player_name,p.games_played from public.round_assignments a join public.open_play_players p on p.id=a.player_id where a.round_id=v_round_id order by a.court_number,a.seat_number;
end; $$;

create or replace function public.owner_reset_rotation(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  delete from public.open_play_rounds where event_id=p_event_id;
  update public.open_play_players set games_played=0,last_round_played=0 where event_id=p_event_id;
end; $$;

alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.court_days enable row level security;
alter table public.time_slots enable row level security;
alter table public.open_play_events enable row level security;
alter table public.bookings enable row level security;
alter table public.open_play_players enable row level security;
alter table public.open_play_rounds enable row level security;
alter table public.round_assignments enable row level security;

drop policy if exists "public read settings" on public.site_settings;
create policy "public read settings" on public.site_settings for select using (true);
drop policy if exists "public read court days" on public.court_days;
create policy "public read court days" on public.court_days for select using (true);
drop policy if exists "public read time slots" on public.time_slots;
create policy "public read time slots" on public.time_slots for select using (true);
drop policy if exists "public read open events" on public.open_play_events;
create policy "public read open events" on public.open_play_events for select using (active=true);

drop policy if exists "owner manages settings" on public.site_settings;
create policy "owner manages settings" on public.site_settings for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages days" on public.court_days;
create policy "owner manages days" on public.court_days for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages slots" on public.time_slots;
create policy "owner manages slots" on public.time_slots for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages events" on public.open_play_events;
create policy "owner manages events" on public.open_play_events for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages bookings" on public.bookings;
create policy "owner manages bookings" on public.bookings for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages players" on public.open_play_players;
create policy "owner manages players" on public.open_play_players for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages rounds" on public.open_play_rounds;
create policy "owner manages rounds" on public.open_play_rounds for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages assignments" on public.round_assignments;
create policy "owner manages assignments" on public.round_assignments for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "user reads own profile" on public.profiles;
create policy "user reads own profile" on public.profiles for select using (auth.uid()=id);

grant select on public.site_settings,public.court_days,public.time_slots,public.open_play_events,public.open_play_public to anon,authenticated;
grant execute on function public.public_create_booking(text,text,date,bigint,integer) to anon,authenticated;
grant execute on function public.public_join_open_play(uuid,text,text) to anon,authenticated;
grant execute on function public.owner_create_next_round(uuid) to authenticated;
grant execute on function public.owner_reset_rotation(uuid) to authenticated;

-- Seed two weeks of date controls. Edit these later from the owner dashboard.
insert into public.court_days(date,mode)
select current_date+i,case when i in (3,6) then 'open_play' else 'regular' end
from generate_series(0,13) as g(i) on conflict(date) do nothing;

insert into public.open_play_events(event_date,start_time,end_time,fee,max_players)
select date,open_start_time,open_end_time,(select open_play_fee from public.site_settings where id=1),40
from public.court_days where mode='open_play'
on conflict(event_date) do nothing;

-- AFTER creating the owner in Authentication > Users, copy the user's UUID and run:
-- update public.profiles set role='owner' where id='PASTE_OWNER_USER_UUID_HERE';
