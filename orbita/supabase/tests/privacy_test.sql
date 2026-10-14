-- Pruebas de privacidad: cada PASS/FAIL verifica quién puede ver qué.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
insert into auth.users values (:A,'juan@x.com','{"full_name":"Juan"}'),(:B,'maria@x.com','{"full_name":"María"}'),(:C,'carlos@x.com','{"full_name":"Carlos"}'),(:D,'pedro@x.com','{"full_name":"Pedro"}');
select id, full_name, username, color from profiles order by 2;
set role authenticated;
-- A crea círculo
select set_config('request.jwt.claim.sub', :A, false);
insert into circles (name, kind, admin_id) values ('Familia','familia', :A);
select c.id as circle from circles c \gset
select code as link from create_invitation(:'circle','link') \gset
select 'A invites C by username';
select code as ccode from create_invitation(:'circle','username','@carlos') \gset
-- B acepta
select set_config('request.jwt.claim.sub', :B, false);
select circle_name, inviter_name, member_count, already_member from get_invitation(:'link');
select respond_invitation(:'link', true, true);
-- C rechaza
select set_config('request.jwt.claim.sub', :C, false);
select count(*) as c_sees_invite from invitations;
select respond_invitation(:'ccode', false);
-- D no puede ver invitación dirigida a C
select set_config('request.jwt.claim.sub', :D, false);
select (select count(*) from get_invitation(:'ccode'))::text = '0' as ok \gset
\if :ok
\echo PASS d_sees_ccode
\else
\echo FAIL d_sees_ccode (esperado 0)
\q
\endif
-- A sin compartir
select set_config('request.jwt.claim.sub', :A, false);
select (select push_location(25.67, -100.31, 5))::text = 'not_sharing' as ok \gset
\if :ok
\echo PASS a_push_off
\else
\echo FAIL a_push_off (esperado not_sharing)
\q
\endif
select status from set_sharing('active','until_off');
select (select push_location(25.67, -100.31, 5))::text = 'ok' as ok \gset
\if :ok
\echo PASS a_push_on
\else
\echo FAIL a_push_on (esperado ok)
\q
\endif
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from live_locations where user_id = :A)::text = '1' as ok \gset
\if :ok
\echo PASS b_sees_a
\else
\echo FAIL b_sees_a (esperado 1)
\q
\endif
select status from set_sharing('active','8h');
select push_location(19.43, -99.13, 12) as b_push;
select set_config('request.jwt.claim.sub', :D, false);
select (select count(*) from live_locations)::text = '0' as ok \gset
\if :ok
\echo PASS d_sees_any
\else
\echo FAIL d_sees_any (esperado 0)
\q
\endif
select (select count(*) from profiles)::text = '1' as ok \gset
\if :ok
\echo PASS d_sees_profiles
\else
\echo FAIL d_sees_profiles (esperado 1)
\q
\endif
select set_config('request.jwt.claim.sub', :C, false);
select (select count(*) from live_locations)::text = '0' as ok \gset
\if :ok
\echo PASS c_sees_any
\else
\echo FAIL c_sees_any (esperado 0)
\q
\endif
-- B pausa
select set_config('request.jwt.claim.sub', :B, false);
select status from set_sharing('paused');
select set_config('request.jwt.claim.sub', :A, false);
select (select count(*) from live_locations where user_id = :B)::text = '0' as ok \gset
\if :ok
\echo PASS a_sees_b_paused
\else
\echo FAIL a_sees_b_paused (esperado 0)
\q
\endif
select full_name, share_status, sharing_enabled, role from circle_directory(:'circle');
-- A bloquea a B
insert into location_blocks values (:A, :B);
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from live_locations where user_id = :A)::text = '0' as ok \gset
\if :ok
\echo PASS b_sees_a_blocked
\else
\echo FAIL b_sees_a_blocked (esperado 0)
\q
\endif
select set_config('request.jwt.claim.sub', :A, false);
delete from location_blocks where viewer_id = :B;
-- A desactiva compartir en el círculo
update circle_members set sharing_enabled = false where circle_id = :'circle' and user_id = :A;
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from live_locations where user_id = :A)::text = '0' as ok \gset
\if :ok
\echo PASS b_sees_a_circle_off
\else
\echo FAIL b_sees_a_circle_off (esperado 0)
\q
\endif
select set_config('request.jwt.claim.sub', :A, false);
update circle_members set sharing_enabled = true where circle_id = :'circle' and user_id = :A;
-- 1h expira
select status, mode, expires_at > now() as exp_future from set_sharing('active','1h');
reset role; update sharing_settings set expires_at = now() - interval '1 minute' where user_id = :A; set role authenticated;
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from live_locations where user_id = :A)::text = '0' as ok \gset
\if :ok
\echo PASS b_sees_a_expired
\else
\echo FAIL b_sees_a_expired (esperado 0)
\q
\endif
select set_config('request.jwt.claim.sub', :A, false);
select (select push_location(25.67, -100.31, 5))::text = 'not_sharing' as ok \gset
\if :ok
\echo PASS a_push_expired
\else
\echo FAIL a_push_expired (esperado not_sharing)
\q
\endif
select status from sharing_settings;
select status from set_sharing('active','always');
-- Historial
update sharing_settings set save_history = true;
select push_location(25.68, -100.32, 5, null, 1.2, 90, now()) ;
select push_location(25.69, -100.33, 5, null, 1.2, 90, now()) ;
select (select count(*) from location_history)::text = '2' as ok \gset
\if :ok
\echo PASS a_own_history
\else
\echo FAIL a_own_history (esperado 2)
\q
\endif
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from location_history where user_id = :A)::text = '0' as ok \gset
\if :ok
\echo PASS b_sees_a_history
\else
\echo FAIL b_sees_a_history (esperado 0)
\q
\endif
select set_config('request.jwt.claim.sub', :A, false);
update circle_members set share_history = true where user_id = :A;
select set_config('request.jwt.claim.sub', :B, false);
select (select count(*) from location_history where user_id = :A)::text = '2' as ok \gset
\if :ok
\echo PASS b_sees_a_history_consent
\else
\echo FAIL b_sees_a_history_consent (esperado 2)
\q
\endif
-- Escrituras directas prohibidas (cada una debe fallar con 'permission denied')
\set ON_ERROR_STOP 0
update live_locations set latitude = 0;
insert into live_locations (user_id, latitude, longitude, recorded_at) values (:B, 1, 1, now());
update circle_members set role = 'admin' where user_id = :B;
update sharing_settings set status = 'active';
insert into circle_members (circle_id, user_id) values (:'circle', :D);
\set ON_ERROR_STOP 1
-- SOS: C (sin círculo) con contacto de emergencia A
select set_config('request.jwt.claim.sub', :C, false);
insert into emergency_contacts (owner_id, name, email) values (:C, 'Juan', 'JUAN@x.com');
select name, contact_user_id is not null as linked from emergency_contacts;
select recipients from start_sos(25.7, -100.3, 8, 'Ayuda') \gset
select :recipients as sos_recipients;
select id as sosid from sos_events \gset
select set_config('request.jwt.claim.sub', :A, false);
select (select count(*) from live_locations where user_id = :C)::text = '1' as ok \gset
\if :ok
\echo PASS a_sees_c_sos
\else
\echo FAIL a_sees_c_sos (esperado 1)
\q
\endif
select kind, title, body from alerts order by created_at;
select full_name from profiles where id = :C;
select set_config('request.jwt.claim.sub', :C, false);
select cancel_sos(:'sosid');
select set_config('request.jwt.claim.sub', :A, false);
select (select count(*) from live_locations where user_id = :C)::text = '0' as ok \gset
\if :ok
\echo PASS a_sees_c_after_cancel
\else
\echo FAIL a_sees_c_after_cancel (esperado 0)
\q
\endif
-- SOS sin contactos: B avisa a su círculo
select set_config('request.jwt.claim.sub', :B, false);
select recipients as b_sos_recipients from start_sos(19.4,-99.1);
-- Admin sale
select set_config('request.jwt.claim.sub', :A, false);
delete from circle_members where user_id = :A;
reset role;
select c.name, p.full_name as admin from circles c join profiles p on p.id = c.admin_id;
select user_id = :B as b_is_admin, role from circle_members;
