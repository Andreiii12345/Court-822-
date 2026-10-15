-- COURT 822 V2 UPGRADE
-- Run once in Supabase SQL Editor. This keeps existing users and bookings.

create extension if not exists pgcrypto;

alter table public.site_settings add column if not exists club_hourly_rate numeric(10,2) not null default 2200;
alter table public.site_settings add column if not exists gcash_name text default 'Court 822';
alter table public.site_settings add column if not exists gcash_number text default '';
alter table public.site_settings add column if not exists maya_name text default 'Court 822';
alter table public.site_settings add column if not exists maya_number text default '';

alter table public.court_days drop constraint if exists court_days_mode_check;
alter table public.court_days add constraint court_days_mode_check check (mode in ('regular','open_play','club_only','closed'));

alter table public.bookings drop constraint if exists bookings_booking_type_check;
alter table public.bookings add constraint bookings_booking_type_check check (booking_type in ('regular','open_play','club'));
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check check (payment_status in ('unpaid','submitted','partial','paid','rejected'));
alter table public.bookings drop constraint if exists bookings_booking_status_check;
alter table public.bookings add constraint bookings_booking_status_check check (booking_status in ('payment_review','pending','confirmed','cancelled','rejected'));
alter table public.bookings add column if not exists duration_hours integer not null default 1 check (duration_hours between 1 and 12);
alter table public.bookings add column if not exists payment_method text check (payment_method in ('gcash','maya','cash'));
alter table public.bookings add column if not exists payment_reference text;
alter table public.bookings add column if not exists payment_proof_path text;
alter table public.bookings add column if not exists club_name text;
alter table public.bookings add column if not exists roster text;

alter table public.open_play_players add column if not exists skill_level integer not null default 3 check (skill_level between 1 and 5);
alter table public.open_play_players add column if not exists player_source text not null default 'online' check (player_source in ('online','walk_in'));
alter table public.open_play_players add column if not exists checked_in boolean not null default true;

create table if not exists public.booking_slots (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_date date not null,
  slot_id bigint not null references public.time_slots(id),
  court_number integer not null check (court_number between 1 and 4),
  unique (booking_date,slot_id,court_number)
);

insert into public.booking_slots(booking_id,booking_date,slot_id,court_number)
select id,booking_date,slot_id,court_number from public.bookings
where booking_type='regular' and slot_id is not null and court_number is not null
and booking_status not in ('cancelled','rejected')
on conflict do nothing;
delete from public.booking_slots bs using public.bookings b
where bs.booking_id=b.id and b.booking_status in ('cancelled','rejected');

insert into public.time_slots(start_time,end_time,rate_key) values
('08:00','09:00','morning'),('10:00','11:00','morning'),
('12:00','13:00','afternoon'),('14:00','15:00','afternoon'),('16:00','17:00','afternoon'),
('18:00','19:00','evening'),('20:00','21:00','evening')
on conflict(start_time,end_time) do nothing;

create or replace function public.ensure_booking_calendar()
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.court_days(date,mode)
  select current_date+i,'regular' from generate_series(0,59) g(i)
  on conflict(date) do nothing;
end; $$;

create or replace function public.sync_open_play_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.mode='open_play' then
    insert into public.open_play_events(event_date,start_time,end_time,fee,max_players,active)
    values(new.date,new.open_start_time,new.open_end_time,(select open_play_fee from public.site_settings where id=1),40,true)
    on conflict(event_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,fee=excluded.fee,active=true;
  else
    update public.open_play_events set active=false where event_date=new.date;
  end if;
  return new;
end; $$;
drop trigger if exists court_day_sync_event on public.court_days;
create trigger court_day_sync_event after insert or update of mode,open_start_time,open_end_time on public.court_days
for each row execute function public.sync_open_play_event();

create or replace function public.public_availability(p_date date)
returns table(slot_id bigint,start_time time,end_time time,rate numeric,available_courts integer)
language sql security definer set search_path=public as $$
  select s.id,s.start_time,s.end_time,
    case s.rate_key when 'morning' then st.morning_rate when 'afternoon' then st.afternoon_rate else st.evening_rate end,
    4-count(b.id)::integer
  from public.time_slots s cross join public.site_settings st
  left join public.booking_slots bs on bs.slot_id=s.id and bs.booking_date=p_date
  left join public.bookings b on b.id=bs.booking_id and b.booking_status not in ('cancelled','rejected')
  where s.active=true and st.id=1
  group by s.id,s.start_time,s.end_time,s.rate_key,st.morning_rate,st.afternoon_rate,st.evening_rate
  order by s.start_time;
$$;

create or replace function public.public_create_booking_v2(
  p_customer_name text,p_mobile_number text,p_booking_date date,p_start_slot_id bigint,
  p_duration_hours integer,p_player_count integer,p_payment_method text,p_payment_reference text,p_payment_proof_path text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_mode text; v_start time; v_court integer; v_id uuid; v_total numeric; v_count integer;
begin
  perform public.ensure_booking_calendar();
  select mode into v_mode from public.court_days where date=p_booking_date;
  if v_mode<>'regular' then raise exception 'This date is not open for court booking'; end if;
  if p_duration_hours not between 1 and 6 then raise exception 'Choose 1 to 6 hours'; end if;
  if p_player_count not between 1 and 8 then raise exception 'A court booking allows 1 to 8 players'; end if;
  if coalesce(trim(p_payment_reference),'')='' or coalesce(trim(p_payment_proof_path),'')='' then raise exception 'Payment reference and proof are required'; end if;
  select start_time into v_start from public.time_slots where id=p_start_slot_id and active=true;
  if v_start is null then raise exception 'Invalid starting time'; end if;
  select count(*),coalesce(sum(case s.rate_key when 'morning' then st.morning_rate when 'afternoon' then st.afternoon_rate else st.evening_rate end),0)
  into v_count,v_total from public.time_slots s cross join public.site_settings st
  where st.id=1 and s.active=true and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval;
  if v_count<>p_duration_hours then raise exception 'The selected duration goes beyond operating hours'; end if;
  for v_court in 1..4 loop
    exit when not exists(
      select 1 from public.booking_slots bs join public.time_slots s on s.id=bs.slot_id
      join public.bookings b on b.id=bs.booking_id
      where bs.booking_date=p_booking_date and bs.court_number=v_court
      and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval
      and b.booking_status not in ('cancelled','rejected'));
  end loop;
  if v_court>4 then raise exception 'No single court is available for the full duration'; end if;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,slot_id,court_number,player_count,duration_hours,total_amount,payment_method,payment_reference,payment_proof_path,payment_status,booking_status)
  values(trim(p_customer_name),trim(p_mobile_number),p_booking_date,'regular',p_start_slot_id,v_court,p_player_count,p_duration_hours,v_total,p_payment_method,trim(p_payment_reference),p_payment_proof_path,'submitted','payment_review') returning id into v_id;
  update public.bookings set payment_status='submitted' where id=v_id;
  insert into public.booking_slots(booking_id,booking_date,slot_id,court_number)
  select v_id,p_booking_date,s.id,v_court from public.time_slots s
  where s.active=true and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval;
  return v_id;
end; $$;

create or replace function public.public_create_club_booking(
  p_customer_name text,p_mobile_number text,p_club_name text,p_roster text,p_booking_date date,
  p_start_slot_id bigint,p_duration_hours integer,p_player_count integer,p_payment_method text,p_payment_reference text,p_payment_proof_path text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_mode text; v_start time; v_id uuid; v_total numeric; v_count integer;
begin
  perform public.ensure_booking_calendar();
  select mode into v_mode from public.court_days where date=p_booking_date;
  if v_mode not in ('regular','club_only') then raise exception 'This date is not open for club booking'; end if;
  if p_duration_hours not between 1 and 8 then raise exception 'Choose 1 to 8 hours'; end if;
  if p_player_count not between 4 and 40 then raise exception 'Club booking allows 4 to 40 players'; end if;
  if coalesce(trim(p_club_name),'')='' or coalesce(trim(p_roster),'')='' then raise exception 'Club name and player list are required'; end if;
  if coalesce(trim(p_payment_reference),'')='' or coalesce(trim(p_payment_proof_path),'')='' then raise exception 'Payment reference and proof are required'; end if;
  select start_time into v_start from public.time_slots where id=p_start_slot_id and active=true;
  select count(*) into v_count from public.time_slots s where s.active=true and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval;
  if v_count<>p_duration_hours then raise exception 'The selected duration goes beyond operating hours'; end if;
  if exists(select 1 from public.booking_slots bs join public.time_slots s on s.id=bs.slot_id join public.bookings b on b.id=bs.booking_id
    where bs.booking_date=p_booking_date and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval and b.booking_status not in ('cancelled','rejected'))
  then raise exception 'The whole facility is not available for the full duration'; end if;
  select club_hourly_rate*p_duration_hours into v_total from public.site_settings where id=1;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,slot_id,player_count,duration_hours,total_amount,payment_method,payment_reference,payment_proof_path,club_name,roster,payment_status,booking_status)
  values(trim(p_customer_name),trim(p_mobile_number),p_booking_date,'club',p_start_slot_id,p_player_count,p_duration_hours,v_total,p_payment_method,trim(p_payment_reference),p_payment_proof_path,trim(p_club_name),trim(p_roster),'submitted','payment_review') returning id into v_id;
  update public.bookings set payment_status='submitted' where id=v_id;
  insert into public.booking_slots(booking_id,booking_date,slot_id,court_number)
  select v_id,p_booking_date,s.id,c from public.time_slots s cross join generate_series(1,4) c
  where s.active=true and s.start_time>=v_start and s.start_time<v_start+(p_duration_hours||' hours')::interval;
  return v_id;
end; $$;

create or replace function public.public_join_open_play_v2(
 p_event_id uuid,p_customer_name text,p_mobile_number text,p_skill_level integer,p_payment_method text,p_payment_reference text,p_payment_proof_path text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_event public.open_play_events%rowtype; v_count integer; v_booking uuid;
begin
  select * into v_event from public.open_play_events where id=p_event_id and active=true for update;
  if not found then raise exception 'Open Play event not found'; end if;
  select count(*) into v_count from public.open_play_players where event_id=p_event_id;
  if v_count>=v_event.max_players then raise exception 'This Open Play session is full'; end if;
  if p_skill_level not between 1 and 5 then raise exception 'Choose a skill level'; end if;
  if coalesce(trim(p_payment_reference),'')='' or coalesce(trim(p_payment_proof_path),'')='' then raise exception 'Payment reference and proof are required'; end if;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,event_id,player_count,total_amount,payment_method,payment_reference,payment_proof_path,payment_status,booking_status)
  values(trim(p_customer_name),trim(p_mobile_number),v_event.event_date,'open_play',p_event_id,1,v_event.fee,p_payment_method,trim(p_payment_reference),p_payment_proof_path,'submitted','payment_review') returning id into v_booking;
  update public.bookings set payment_status='submitted' where id=v_booking;
  insert into public.open_play_players(event_id,booking_id,player_name,skill_level,player_source) values(p_event_id,v_booking,trim(p_customer_name),p_skill_level,'online');
  return v_booking;
end; $$;

create or replace function public.owner_set_booking_status(p_booking_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if p_status not in ('confirmed','cancelled','rejected') then raise exception 'Invalid status'; end if;
  if p_status='confirmed' then
    update public.bookings set booking_status='confirmed',paid_amount=total_amount where id=p_booking_id;
  else
    update public.bookings set booking_status=p_status,payment_status=case when p_status='rejected' then 'rejected' else payment_status end where id=p_booking_id;
    delete from public.booking_slots where booking_id=p_booking_id;
  end if;
end; $$;

create or replace function public.owner_add_walkin(p_event_id uuid,p_player_name text,p_mobile_number text,p_skill_level integer,p_is_paid boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_event public.open_play_events%rowtype; v_booking uuid;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  select * into v_event from public.open_play_events where id=p_event_id and active=true;
  if not found then raise exception 'Open Play event not found'; end if;
  if (select count(*) from public.open_play_players where event_id=p_event_id)>=v_event.max_players then raise exception 'Session is full'; end if;
  insert into public.bookings(customer_name,mobile_number,booking_date,booking_type,event_id,player_count,total_amount,paid_amount,payment_method,payment_status,booking_status)
  values(trim(p_player_name),coalesce(nullif(trim(p_mobile_number),''),'WALK-IN'),v_event.event_date,'open_play',p_event_id,1,v_event.fee,case when p_is_paid then v_event.fee else 0 end,'cash',case when p_is_paid then 'paid' else 'unpaid' end,case when p_is_paid then 'confirmed' else 'pending' end) returning id into v_booking;
  insert into public.open_play_players(event_id,booking_id,player_name,skill_level,player_source) values(p_event_id,v_booking,trim(p_player_name),p_skill_level,'walk_in');
  return v_booking;
end; $$;

create or replace function public.owner_create_ranked_round(p_event_id uuid)
returns table(round_number integer,court_number integer,player_id uuid,player_name text,skill_level integer,games_played integer,queue_rank integer)
language plpgsql security definer set search_path=public as $$
declare v_round integer; v_round_id uuid;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  select coalesce(max(r.round_number),0)+1 into v_round from public.open_play_rounds r where r.event_id=p_event_id;
  insert into public.open_play_rounds(event_id,round_number) values(p_event_id,v_round) returning id into v_round_id;
  with ranked as (
    select p.id,p.skill_level,row_number() over(order by p.games_played,(p.last_round_played=v_round-1),p.last_round_played,p.created_at,random()) n
    from public.open_play_players p join public.bookings b on b.id=p.booking_id
    where p.event_id=p_event_id and p.checked_in=true and b.booking_status='confirmed'
    order by p.games_played,(p.last_round_played=v_round-1),p.last_round_played,p.created_at,random()
    limit 16
  ), seeded as (
    select *,row_number() over(order by skill_level desc,n) s from ranked
  )
  insert into public.round_assignments(round_id,court_number,player_id,seat_number)
  select v_round_id,((s-1)%4)+1,id,((s-1)/4)+1 from seeded;
  update public.open_play_players p set games_played=p.games_played+1,last_round_played=v_round
  where p.id in(select a.player_id from public.round_assignments a where a.round_id=v_round_id);
  return query
  select v_round,a.court_number,p.id,p.player_name,p.skill_level,p.games_played,
    row_number() over(order by p.games_played,p.last_round_played,p.created_at)::integer
  from public.round_assignments a join public.open_play_players p on p.id=a.player_id
  where a.round_id=v_round_id order by a.court_number,a.seat_number;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public uploads payment proof" on storage.objects;
create policy "public uploads payment proof" on storage.objects for insert to anon,authenticated
with check(bucket_id='payment-proofs');
drop policy if exists "owner reads payment proof" on storage.objects;
create policy "owner reads payment proof" on storage.objects for select to authenticated
using(bucket_id='payment-proofs' and public.is_owner());

alter table public.booking_slots enable row level security;
drop policy if exists "owner manages booking slots" on public.booking_slots;
create policy "owner manages booking slots" on public.booking_slots for all using(public.is_owner()) with check(public.is_owner());

grant execute on function public.ensure_booking_calendar() to anon,authenticated;
grant execute on function public.public_availability(date) to anon,authenticated;
grant execute on function public.public_create_booking_v2(text,text,date,bigint,integer,integer,text,text,text) to anon,authenticated;
grant execute on function public.public_create_club_booking(text,text,text,text,date,bigint,integer,integer,text,text,text) to anon,authenticated;
grant execute on function public.public_join_open_play_v2(uuid,text,text,integer,text,text,text) to anon,authenticated;
grant execute on function public.owner_add_walkin(uuid,text,text,integer,boolean) to authenticated;
grant execute on function public.owner_create_ranked_round(uuid) to authenticated;
grant execute on function public.owner_set_booking_status(uuid,text) to authenticated;
grant select on public.booking_slots to authenticated;

select public.ensure_booking_calendar();
