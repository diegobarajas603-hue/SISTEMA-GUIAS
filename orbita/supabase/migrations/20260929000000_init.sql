-- =============================================================================
-- Órbita · esquema inicial
--
-- La privacidad se aplica AQUÍ, en la base de datos, con Row Level Security:
-- aunque alguien modificara la app, el servidor nunca entrega la ubicación de
-- una persona a quien no tenga su consentimiento vigente.
--
-- Reglas de visibilidad de la ubicación en vivo de A para B:
--   * A == B, o
--   * A está compartiendo (status 'active' y sin expirar), A y B están en un
--     mismo círculo, A tiene activado compartir en ESE círculo, y A no bloqueó
--     a B, o
--   * A tiene una alerta SOS activa y B es uno de sus destinatarios.
--
-- El historial de A sólo lo ve A, salvo que A active "compartir historial"
-- en un círculo del que B también sea miembro.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.share_status as enum ('off', 'active', 'paused');
create type public.share_mode as enum ('always', '1h', '8h', 'until_off');
create type public.circle_kind as enum ('familia', 'amigos', 'trabajo', 'pareja', 'emergencias', 'otro');
create type public.circle_role as enum ('admin', 'member');
create type public.invite_channel as enum ('link', 'code', 'email', 'phone', 'username');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.sos_status as enum ('active', 'cancelled', 'expired');

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  username    text unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  email       text,
  phone       text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  avatar_url  text,
  color       text not null default '#7C5CFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_phone_idx on public.profiles (phone);

-- Estado de "compartir ubicación" del usuario (uno por usuario).
create table public.sharing_settings (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  status       public.share_status not null default 'off',
  mode         public.share_mode not null default 'until_off',
  expires_at   timestamptz,
  save_history boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Círculos
-- -----------------------------------------------------------------------------
create table public.circles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  kind        public.circle_kind not null default 'otro',
  icon        text not null default 'users' check (char_length(icon) <= 32),
  color       text not null default '#7C5CFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  admin_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.circle_members (
  circle_id       uuid not null references public.circles (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.circle_role not null default 'member',
  -- Consentimiento por círculo: ¿comparto mi ubicación con ESTE círculo?
  sharing_enabled boolean not null default true,
  -- Consentimiento explícito y separado para mostrar mi historial.
  share_history   boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_user_idx on public.circle_members (user_id);

-- "Dejar de compartir con una persona": owner deja de ser visible para viewer.
create table public.location_blocks (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

-- -----------------------------------------------------------------------------
-- Ubicación
-- -----------------------------------------------------------------------------
create table public.live_locations (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  latitude       double precision not null check (latitude between -90 and 90),
  longitude      double precision not null check (longitude between -180 and 180),
  accuracy       real,
  altitude       real,
  speed          real,
  heading        real,
  is_approximate boolean not null default false,
  battery_level  real check (battery_level is null or battery_level between 0 and 1),
  recorded_at    timestamptz not null,
  updated_at     timestamptz not null default now()
);

create table public.location_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    real,
  speed       real,
  recorded_at timestamptz not null
);
create index location_history_user_time_idx on public.location_history (user_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Invitaciones
-- -----------------------------------------------------------------------------
create or replace function public.gen_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin 0/O/1/I
  bytes bytea := gen_random_bytes(8);
  result text := '';
begin
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default public.gen_invite_code(),
  circle_id       uuid not null references public.circles (id) on delete cascade,
  inviter_id      uuid not null references public.profiles (id) on delete cascade,
  channel         public.invite_channel not null,
  invitee_user_id uuid references public.profiles (id) on delete cascade,
  invitee_email   text,
  invitee_phone   text,
  status          public.invite_status not null default 'pending',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  responded_at    timestamptz
);
create index invitations_invitee_idx on public.invitations (invitee_user_id) where status = 'pending';
create index invitations_circle_idx on public.invitations (circle_id);

-- -----------------------------------------------------------------------------
-- Seguridad: contactos de emergencia, SOS y alertas
-- -----------------------------------------------------------------------------
create table public.emergency_contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 60),
  phone           text,
  email           text,
  contact_user_id uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (phone is not null or email is not null or contact_user_id is not null)
);
create index emergency_contacts_owner_idx on public.emergency_contacts (owner_id);

create table public.sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    real,
  message     text check (message is null or char_length(message) <= 200),
  status      public.sos_status not null default 'active',
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '60 minutes',
  ended_at    timestamptz
);
create index sos_events_user_idx on public.sos_events (user_id, started_at desc);

create table public.sos_recipients (
  sos_id       uuid not null references public.sos_events (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  primary key (sos_id, recipient_id)
);
create index sos_recipients_recipient_idx on public.sos_recipients (recipient_id);

create table public.alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,  -- sos | sos_ended | invite | member_joined | invite_declined
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index alerts_user_idx on public.alerts (user_id, created_at desc);

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- =============================================================================
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión de RLS)
-- =============================================================================
create or replace function public.is_circle_member(p_circle uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members where circle_id = p_circle and user_id = p_user);
$$;

create or replace function public.is_circle_admin(p_circle uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members
                 where circle_id = p_circle and user_id = p_user and role = 'admin');
$$;

create or replace function public.shares_circle(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from circle_members m1
    join circle_members m2 on m2.circle_id = m1.circle_id
    where m1.user_id = p_a and m2.user_id = p_b
  );
$$;

create or replace function public.is_sharing_active(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sharing_settings
    where user_id = p_user and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.has_active_sos(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sos_events
                 where user_id = p_user and status = 'active' and expires_at > now());
$$;

create or replace function public.is_sos_recipient(p_sos uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sos_recipients where sos_id = p_sos and recipient_id = p_user);
$$;

create or replace function public.is_sos_owner(p_sos uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sos_events where id = p_sos and user_id = p_user);
$$;

-- ¿viewer recibió alguna vez un SOS de owner? (para poder ver su nombre y foto)
create or replace function public.received_sos_from(p_owner uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sos_events e join sos_recipients r on r.sos_id = e.id
                 where e.user_id = p_owner and r.recipient_id = p_viewer);
$$;

create or replace function public.can_view_location(p_owner uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer is not null and (
    p_owner = p_viewer
    or (
      public.is_sharing_active(p_owner)
      and not exists (select 1 from location_blocks where owner_id = p_owner and viewer_id = p_viewer)
      and exists (
        select 1 from circle_members m1
        join circle_members m2 on m2.circle_id = m1.circle_id
        where m1.user_id = p_owner and m1.sharing_enabled and m2.user_id = p_viewer
      )
    )
    or exists (
      select 1 from sos_events e
      join sos_recipients r on r.sos_id = e.id
      where e.user_id = p_owner and e.status = 'active' and e.expires_at > now()
        and r.recipient_id = p_viewer
    )
  );
$$;

create or replace function public.can_view_history(p_owner uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer is not null and (
    p_owner = p_viewer
    or (
      not exists (select 1 from location_blocks where owner_id = p_owner and viewer_id = p_viewer)
      and exists (
        select 1 from circle_members m1
        join circle_members m2 on m2.circle_id = m1.circle_id
        where m1.user_id = p_owner and m1.share_history and m2.user_id = p_viewer
      )
    )
  );
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger sharing_touch before update on public.sharing_settings
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Triggers de ciclo de vida
-- =============================================================================

-- Al registrarse: crear perfil y configuración de compartir (apagada).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  palette text[] := array['#7C5CFF','#22D3EE','#34D399','#F472B6','#FBBF24','#60A5FA','#F87171','#A78BFA'];
begin
  base := regexp_replace(lower(split_part(coalesce(new.email, 'usuario'), '@', 1)), '[^a-z0-9_.]', '', 'g');
  if char_length(base) < 3 then base := 'usuario'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    candidate := base || (floor(random() * 9000) + 1000)::int;
  end loop;

  insert into profiles (id, full_name, username, email, color)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80),
    candidate,
    new.email,
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  insert into sharing_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantener el correo del perfil sincronizado con auth.
create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- El creador de un círculo queda como administrador y miembro.
create or replace function public.handle_new_circle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into circle_members (circle_id, user_id, role, sharing_enabled)
  values (new.id, new.admin_id, 'admin', true);
  return new;
end $$;

create trigger on_circle_created after insert on public.circles
  for each row execute function public.handle_new_circle();

-- Si el administrador sale, hereda el rol el miembro más antiguo;
-- si ya no queda nadie, se elimina el círculo.
create or replace function public.handle_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  heir uuid;
begin
  if old.role <> 'admin' then
    return old;
  end if;
  if not exists (select 1 from circles where id = old.circle_id) then
    return old;  -- el círculo se está borrando en cascada
  end if;
  select user_id into heir from circle_members
   where circle_id = old.circle_id order by joined_at limit 1;
  if heir is null then
    delete from circles where id = old.circle_id;
  else
    update circle_members set role = 'admin' where circle_id = old.circle_id and user_id = heir;
    update circles set admin_id = heir where id = old.circle_id;
  end if;
  return old;
end $$;

create trigger on_member_left after delete on public.circle_members
  for each row execute function public.handle_member_left();

-- Vincular contactos de emergencia con usuarios de la app (por correo/teléfono).
create or replace function public.link_emergency_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_user_id is null then
    select id into new.contact_user_id from profiles
     where id <> new.owner_id
       and ((new.email is not null and lower(email) = lower(new.email))
         or (new.phone is not null and phone = new.phone))
     limit 1;
  end if;
  return new;
end $$;

create trigger emergency_contact_link before insert or update on public.emergency_contacts
  for each row execute function public.link_emergency_contact();

-- =============================================================================
-- RPCs
-- =============================================================================

-- Cambiar el estado de compartir. Al apagar, se borra la última ubicación
-- publicada: dejar de compartir no deja rastro visible para nadie.
create or replace function public.set_sharing(p_status public.share_status, p_mode public.share_mode default 'until_off')
returns public.sharing_settings
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  result sharing_settings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  insert into sharing_settings (user_id) values (uid) on conflict do nothing;

  update sharing_settings set
    status = p_status,
    mode = case when p_status = 'active' then p_mode else mode end,
    expires_at = case
      when p_status <> 'active' then null
      when p_mode = '1h' then now() + interval '1 hour'
      when p_mode = '8h' then now() + interval '8 hours'
      else null
    end
  where user_id = uid
  returning * into result;

  if p_status = 'off' and not public.has_active_sos(uid) then
    delete from live_locations where user_id = uid;
  end if;

  return result;
end $$;

-- Publicar una lectura de ubicación. Sólo se acepta si el usuario está
-- compartiendo o tiene un SOS activo; si no, responde 'not_sharing' para que
-- la tarea en segundo plano se detenga sola.
create or replace function public.push_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy real default null,
  p_altitude real default null,
  p_speed real default null,
  p_heading real default null,
  p_recorded_at timestamptz default now(),
  p_is_approximate boolean default false,
  p_battery_level real default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  keep_history boolean;
  recorded timestamptz := least(coalesce(p_recorded_at, now()), now());
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  -- Expirar compartir temporal (1 h / 8 h) de forma perezosa.
  update sharing_settings set status = 'off', expires_at = null
   where user_id = uid and status = 'active' and expires_at is not null and expires_at <= now();

  if not public.is_sharing_active(uid) and not public.has_active_sos(uid) then
    return 'not_sharing';
  end if;

  insert into live_locations as l (user_id, latitude, longitude, accuracy, altitude, speed,
                                   heading, is_approximate, battery_level, recorded_at, updated_at)
  values (uid, p_latitude, p_longitude, p_accuracy, p_altitude, p_speed,
          p_heading, p_is_approximate, p_battery_level, recorded, now())
  on conflict (user_id) do update set
    latitude = excluded.latitude, longitude = excluded.longitude, accuracy = excluded.accuracy,
    altitude = excluded.altitude, speed = excluded.speed, heading = excluded.heading,
    is_approximate = excluded.is_approximate, battery_level = excluded.battery_level,
    recorded_at = excluded.recorded_at, updated_at = now()
  where l.recorded_at <= excluded.recorded_at;  -- no retroceder con lecturas viejas

  select save_history into keep_history from sharing_settings where user_id = uid;
  if coalesce(keep_history, false) then
    insert into location_history (user_id, latitude, longitude, accuracy, speed, recorded_at)
    values (uid, p_latitude, p_longitude, p_accuracy, p_speed, recorded);
  end if;

  return 'ok';
end $$;

-- Crear una invitación. Cualquier miembro del círculo puede invitar.
create or replace function public.create_invitation(
  p_circle uuid,
  p_channel public.invite_channel,
  p_target text default null
) returns public.invitations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target_user uuid;
  target text := nullif(btrim(coalesce(p_target, '')), '');
  inv invitations;
  inviter_name text;
  circle_name text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_circle_member(p_circle, uid) then raise exception 'not_a_member'; end if;

  if p_channel in ('email', 'phone', 'username') and target is null then
    raise exception 'target_required';
  end if;

  if p_channel = 'email' then
    target := lower(target);
    select id into target_user from profiles where lower(email) = target;
  elsif p_channel = 'phone' then
    target := regexp_replace(target, '[^0-9+]', '', 'g');
    select id into target_user from profiles where phone = target;
  elsif p_channel = 'username' then
    target := lower(ltrim(target, '@'));
    select id into target_user from profiles where username = target;
    if target_user is null then raise exception 'user_not_found'; end if;
  end if;

  if target_user = uid then raise exception 'cannot_invite_self'; end if;
  if target_user is not null and public.is_circle_member(p_circle, target_user) then
    raise exception 'already_member';
  end if;

  insert into invitations (circle_id, inviter_id, channel, invitee_user_id, invitee_email, invitee_phone)
  values (p_circle, uid, p_channel, target_user,
          case when p_channel = 'email' then target end,
          case when p_channel = 'phone' then target end)
  returning * into inv;

  if target_user is not null then
    select full_name into inviter_name from profiles where id = uid;
    select name into circle_name from circles where id = p_circle;
    insert into alerts (user_id, kind, title, body, data)
    values (target_user, 'invite', 'Nueva invitación',
            coalesce(nullif(inviter_name, ''), 'Alguien') || ' te invitó a unirte a su círculo ' || circle_name,
            jsonb_build_object('code', inv.code, 'circle_id', p_circle));
  end if;

  return inv;
end $$;

-- Datos públicos de una invitación para la pantalla "X te invitó a...".
create or replace function public.get_invitation(p_code text)
returns table (
  code text, status public.invite_status, expires_at timestamptz, is_expired boolean,
  circle_id uuid, circle_name text, circle_kind public.circle_kind, circle_color text, circle_icon text,
  member_count int, inviter_name text, inviter_avatar text, already_member boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
    select i.code, i.status, i.expires_at, i.expires_at <= now(),
           c.id, c.name, c.kind, c.color, c.icon,
           (select count(*)::int from circle_members m where m.circle_id = c.id),
           p.full_name, p.avatar_url,
           public.is_circle_member(c.id, uid)
      from invitations i
      join circles c on c.id = i.circle_id
      join profiles p on p.id = i.inviter_id
     where i.code = upper(btrim(p_code))
       and (i.invitee_user_id is null or i.invitee_user_id = uid or i.inviter_id = uid);
end $$;

-- Aceptar o rechazar. Aceptar = consentimiento del invitado; el invitado
-- decide además si comparte su ubicación con el círculo (p_share).
create or replace function public.respond_invitation(p_code text, p_accept boolean, p_share boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv invitations;
  me_name text;
  circle_name text;
  is_open boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into inv from invitations where code = upper(btrim(p_code)) for update;
  if inv.id is null then raise exception 'invitation_not_found'; end if;
  if inv.invitee_user_id is not null and inv.invitee_user_id <> uid then raise exception 'invitation_not_found'; end if;
  if inv.inviter_id = uid then raise exception 'cannot_accept_own_invitation'; end if;
  if inv.status <> 'pending' then raise exception 'invitation_closed'; end if;
  if inv.expires_at <= now() then raise exception 'invitation_expired'; end if;

  -- Los enlaces/códigos abiertos pueden usarse varias veces hasta expirar.
  is_open := inv.channel in ('link', 'code');

  select full_name into me_name from profiles where id = uid;
  select name into circle_name from circles where id = inv.circle_id;

  if p_accept then
    insert into circle_members (circle_id, user_id, role, sharing_enabled)
    values (inv.circle_id, uid, 'member', coalesce(p_share, false))
    on conflict (circle_id, user_id) do nothing;

    if not is_open then
      update invitations set status = 'accepted', responded_at = now(), invitee_user_id = uid
       where id = inv.id;
    end if;

    insert into alerts (user_id, kind, title, body, data)
    values (inv.inviter_id, 'member_joined', 'Nuevo miembro',
            coalesce(nullif(me_name, ''), 'Alguien') || ' se unió a ' || circle_name,
            jsonb_build_object('circle_id', inv.circle_id, 'user_id', uid));
  else
    if not is_open then
      update invitations set status = 'declined', responded_at = now(), invitee_user_id = uid
       where id = inv.id;
      insert into alerts (user_id, kind, title, body, data)
      values (inv.inviter_id, 'invite_declined', 'Invitación rechazada',
              coalesce(nullif(me_name, ''), 'Alguien') || ' rechazó unirse a ' || circle_name,
              jsonb_build_object('circle_id', inv.circle_id));
    end if;
  end if;

  return inv.circle_id;
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update invitations set status = 'revoked', responded_at = now()
   where id = p_id and status = 'pending'
     and (inviter_id = auth.uid() or public.is_circle_admin(circle_id));
end $$;

-- Iniciar SOS: registra hora y ubicación, publica la ubicación y avisa a los
-- contactos de emergencia que usan la app. Si no hay ninguno configurado,
-- avisa a los miembros de todos los círculos del usuario.
create or replace function public.start_sos(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy real default null,
  p_message text default null,
  p_minutes int default 60
) returns table (sos_id uuid, recipients int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ev sos_events;
  me_name text;
  n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  -- Sólo un SOS activo a la vez.
  update sos_events set status = 'expired', ended_at = now()
   where user_id = uid and status = 'active';

  insert into sos_events (user_id, latitude, longitude, accuracy, message, expires_at)
  values (uid, p_latitude, p_longitude, p_accuracy, p_message,
          now() + make_interval(mins => greatest(5, least(coalesce(p_minutes, 60), 240))))
  returning * into ev;

  insert into sos_recipients (sos_id, recipient_id)
  select distinct ev.id, contact_user_id from emergency_contacts
   where owner_id = uid and contact_user_id is not null and contact_user_id <> uid
  union
  select distinct ev.id, m2.user_id from circle_members m1
    join circles c on c.id = m1.circle_id and c.kind = 'emergencias'
    join circle_members m2 on m2.circle_id = m1.circle_id
   where m1.user_id = uid and m2.user_id <> uid
  on conflict do nothing;

  get diagnostics n = row_count;
  if n = 0 then
    insert into sos_recipients (sos_id, recipient_id)
    select distinct ev.id, m2.user_id from circle_members m1
      join circle_members m2 on m2.circle_id = m1.circle_id
     where m1.user_id = uid and m2.user_id <> uid
    on conflict do nothing;
  end if;

  insert into live_locations as l (user_id, latitude, longitude, accuracy, recorded_at, updated_at)
  values (uid, p_latitude, p_longitude, p_accuracy, now(), now())
  on conflict (user_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    accuracy = excluded.accuracy, recorded_at = excluded.recorded_at, updated_at = now();

  select full_name into me_name from profiles where id = uid;
  insert into alerts (user_id, kind, title, body, data)
  select r.recipient_id, 'sos', '🚨 Alerta SOS',
         coalesce(nullif(me_name, ''), 'Un contacto') || ' activó una alerta de emergencia. Toca para ver su ubicación.',
         jsonb_build_object('sos_id', ev.id, 'user_id', uid,
                            'latitude', p_latitude, 'longitude', p_longitude)
    from sos_recipients r where r.sos_id = ev.id;

  select count(*)::int into n from sos_recipients r where r.sos_id = ev.id;
  return query select ev.id, n;
end $$;

create or replace function public.cancel_sos(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me_name text;
begin
  update sos_events set status = 'cancelled', ended_at = now()
   where id = p_id and user_id = uid and status = 'active';
  if not found then return; end if;

  select full_name into me_name from profiles where id = uid;
  insert into alerts (user_id, kind, title, body, data)
  select r.recipient_id, 'sos_ended', 'Alerta SOS cancelada',
         coalesce(nullif(me_name, ''), 'Tu contacto') || ' canceló la alerta de emergencia.',
         jsonb_build_object('sos_id', p_id, 'user_id', uid)
    from sos_recipients r where r.sos_id = p_id;

  if not public.is_sharing_active(uid) then
    delete from live_locations where user_id = uid;
  end if;
end $$;

-- Directorio de un círculo: miembros con su estado de compartir (sin coordenadas;
-- las coordenadas se leen de live_locations, que aplica RLS).
create or replace function public.circle_directory(p_circle uuid)
returns table (
  user_id uuid, full_name text, username text, avatar_url text, color text,
  role public.circle_role, sharing_enabled boolean, share_history boolean,
  share_status public.share_status, share_expires_at timestamptz, joined_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_circle_member(p_circle, auth.uid()) then raise exception 'not_a_member'; end if;
  return query
    select p.id, p.full_name, p.username, p.avatar_url, p.color,
           m.role, m.sharing_enabled, m.share_history,
           case
             when s.status = 'active' and s.expires_at is not null and s.expires_at <= now() then 'off'::share_status
             else coalesce(s.status, 'off'::share_status)
           end,
           s.expires_at, m.joined_at
      from circle_members m
      join profiles p on p.id = m.user_id
      left join sharing_settings s on s.user_id = m.user_id
     where m.circle_id = p_circle
     order by m.role, p.full_name;
end $$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles           enable row level security;
alter table public.sharing_settings   enable row level security;
alter table public.circles            enable row level security;
alter table public.circle_members     enable row level security;
alter table public.location_blocks    enable row level security;
alter table public.live_locations     enable row level security;
alter table public.location_history   enable row level security;
alter table public.invitations        enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sos_events         enable row level security;
alter table public.sos_recipients     enable row level security;
alter table public.alerts             enable row level security;
alter table public.push_tokens        enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_circle(id, auth.uid()) or public.received_sos_from(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- sharing_settings: el propio usuario lo lee; los cambios van por set_sharing(),
-- salvo save_history que puede editarse directamente.
create policy sharing_select on public.sharing_settings for select to authenticated
  using (user_id = auth.uid());
create policy sharing_update on public.sharing_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- circles
create policy circles_select on public.circles for select to authenticated
  using (public.is_circle_member(id));
create policy circles_insert on public.circles for insert to authenticated
  with check (admin_id = auth.uid());
create policy circles_update on public.circles for update to authenticated
  using (public.is_circle_admin(id)) with check (public.is_circle_admin(id));
create policy circles_delete on public.circles for delete to authenticated
  using (public.is_circle_admin(id));

-- circle_members: altas sólo vía triggers/RPC; cada quien edita su propio
-- consentimiento; salir del grupo = borrar la propia fila; el admin puede
-- quitar a otros.
create policy members_select on public.circle_members for select to authenticated
  using (public.is_circle_member(circle_id));
create policy members_update on public.circle_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on public.circle_members for delete to authenticated
  using (user_id = auth.uid() or public.is_circle_admin(circle_id));

-- location_blocks
create policy blocks_all on public.location_blocks for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- live_locations: lectura según consentimiento; escritura sólo por push_location().
create policy live_select on public.live_locations for select to authenticated
  using (public.can_view_location(user_id));

-- location_history
create policy history_select on public.location_history for select to authenticated
  using (public.can_view_history(user_id));
create policy history_delete on public.location_history for delete to authenticated
  using (user_id = auth.uid());

-- invitations: escritura sólo por RPC.
create policy invitations_select on public.invitations for select to authenticated
  using (inviter_id = auth.uid() or invitee_user_id = auth.uid()
         or public.is_circle_admin(circle_id));

-- emergency_contacts
create policy contacts_all on public.emergency_contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- sos
create policy sos_select on public.sos_events for select to authenticated
  using (user_id = auth.uid() or public.is_sos_recipient(id));
create policy sos_recipients_select on public.sos_recipients for select to authenticated
  using (recipient_id = auth.uid() or public.is_sos_owner(sos_id));

-- alerts
create policy alerts_select on public.alerts for select to authenticated using (user_id = auth.uid());
create policy alerts_update on public.alerts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alerts_delete on public.alerts for delete to authenticated using (user_id = auth.uid());

-- push_tokens
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Privilegios por columna: lo que el cliente puede editar directamente.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on public.live_locations, public.location_history,
  public.invitations, public.sos_events, public.sos_recipients, public.alerts
  from anon, authenticated;
grant delete on public.location_history to authenticated;
grant update (read_at) on public.alerts to authenticated;
grant delete on public.alerts to authenticated;

revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, username, phone, avatar_url, color) on public.profiles to authenticated;

revoke insert, update on public.sharing_settings from anon, authenticated;
grant update (save_history) on public.sharing_settings to authenticated;

revoke insert, update on public.circle_members from anon, authenticated;
grant update (sharing_enabled, share_history) on public.circle_members to authenticated;

revoke update on public.circles from anon, authenticated;
grant update (name, kind, icon, color) on public.circles to authenticated;

revoke all on function public.gen_invite_code() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_circle() from public, anon, authenticated;
revoke all on function public.handle_member_left() from public, anon, authenticated;
revoke all on function public.link_emergency_contact() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

-- =============================================================================
-- Realtime y almacenamiento (sólo si existen, p. ej. en Supabase)
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.live_locations, public.alerts, public.sos_events,
      public.circle_members, public.invitations;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

    execute $p$create policy "avatars_read" on storage.objects for select
      using (bucket_id = 'avatars')$p$;
    execute $p$create policy "avatars_write_own" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatars_update_own" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatars_delete_own" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;
