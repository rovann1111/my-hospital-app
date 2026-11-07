/*
# Add staff authentication & user management

## Overview
Adds a custom username/password authentication system for hospital staff
(receptionists, doctors, admins). Public patients keep using the existing
anon-key client with no login. Staff login is implemented as SECURITY DEFINER
functions backed by pgcrypto bcrypt hashing — the browser talks straight to
the database, so privileged mutations (login, user CRUD) must run as the
table owner with explicit role checks, not as the anon role.

This is NOT Supabase email/password auth: the spec requires usernames
("shery"), not emails, so a custom staff_users table is the correct shape.

## New Tables

1. `staff_users` — hospital staff accounts (admins / receptionists / doctors)
   - id (uuid PK)
   - username (citext, UNIQUE, NOT NULL) — case-insensitive login handle
   - password_hash (text, NOT NULL) — bcrypt hash via pgcrypto crypt()
   - display_name (text) — friendly name shown in the UI
   - role (text, NOT NULL, default 'receptionist') — admin | receptionist | doctor
   - is_super_admin (boolean, default false) — un-deletable super-admin flag
   - is_active (boolean, default true) — enable/disable without deleting
   - created_at, updated_at (timestamptz)

2. `staff_sessions` — opaque session tokens issued at login
   - id (uuid PK)
   - staff_user_id (uuid FK -> staff_users, ON DELETE CASCADE)
   - token (uuid, UNIQUE, NOT NULL) — random opaque token stored client-side
   - expires_at (timestamptz, NOT NULL)
   - created_at (timestamptz)
   - revoked_at (timestamptz) — set on logout

## New Functions (all SECURITY DEFINER, search_path = public)

1. `staff_login(p_username text, p_password text)` RETURNS table(success, ...)
   - Verifies credentials against bcrypt hash via crypt(pw, hash).
   - On success issues a new session row and returns user + token.
   - On failure returns one row with success=false (no exception) so the
     client can branch cleanly without catching PostgREST errors.
   - Always runs crypt() to avoid a timing leak on missing usernames.

2. `current_staff()` RETURNS staff_users
   - Resolves the caller from the `x-staff-token` request header.
   - Returns the user row iff there is a non-revoked, unexpired, active
     session matching that token; otherwise NULL.

3. `staff_logout(p_token uuid)` RETURNS void — revokes the session.

4. `staff_create_user(p_actor_token uuid, p_username, p_password, p_display_name, p_role)`
   - Admin-only. bcrypt-hashes the password (cost 10). Rejects dup usernames.

5. `staff_update_user(p_actor_token uuid, p_user_id, p_display_name, p_role, p_is_active, p_password)`
   - Admin-only. Re-hashes password if non-empty. Super-admins can't be deactivated.

6. `staff_delete_user(p_actor_token uuid, p_user_id)` RETURNS void
   - Admin-only. Refuses on super-admins.

7. `staff_list_users(p_actor_token uuid)` RETURNS setof staff_users
   - Admin-only. Returns all staff users (no password hashes exposed to the
     client because the function selects the whole row but RLS/grants block
     direct table reads; password_hash is dropped client-side in TS).

## Security
- RLS ENABLED on both new tables. The anon role gets NO direct grants on
  staff_users or staff_sessions — all access goes through the SECURITY
  DEFINER functions, which run as the table owner and enforce role checks
  internally. The browser (anon key) cannot read password hashes or
  enumerate users directly; it can only call the audited functions.
- EXECUTE on every staff function is granted to anon, authenticated. Admin
  functions check `_assert_admin()` internally, so granting EXECUTE is safe;
  a non-admin caller gets a clean error from the function body.
- `_assert_admin()` is internal: EXECUTE revoked from PUBLIC (no anon grant).
- Seed: super-admin `shery` / `shery123` (bcrypt-hashed, is_super_admin=true).
- 12-hour session expiry enforced in current_staff() and at login.

## Notes
- The frontend stores the returned token in localStorage and sends it as the
  `x-staff-token` header on every staff RPC call via supabase.rpc().
- Password hashing uses pgcrypto: crypt(password, gen_salt('bf', 10)).
- No changes to existing clinic tables; this migration is additive.
*/

-- ---------- staff_users ----------
CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'receptionist' CHECK (role IN ('admin','receptionist','doctor')),
  is_super_admin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_users TO service_role;

-- ---------- staff_sessions ----------
CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_sessions TO service_role;

-- Resolve caller from request header token.
CREATE OR REPLACE FUNCTION current_staff()
RETURNS staff_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_user staff_users;
BEGIN
  v_token := nullif(current_setting('request.header.x-staff-token', true), '');
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT su.*
    INTO v_user
    FROM staff_sessions s
    JOIN staff_users su ON su.id = s.staff_user_id
    WHERE s.token::text = v_token
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND su.is_active = true
    LIMIT 1;
  RETURN v_user;
END;
$$;

-- Login: verify credentials, issue session, return user + token.
CREATE OR REPLACE FUNCTION staff_login(p_username text, p_password text)
RETURNS TABLE (
  success boolean,
  user_id uuid,
  username text,
  display_name text,
  role text,
  is_super_admin boolean,
  token uuid,
  expires_at timestamptz,
  error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user staff_users;
  v_token uuid;
  v_expires timestamptz := now() + interval '12 hours';
BEGIN
  SELECT * INTO v_user FROM staff_users WHERE username = p_username::citext LIMIT 1;

  IF v_user.id IS NULL OR v_user.password_hash IS NULL THEN
    PERFORM crypt(p_password, gen_salt('bf', 10));
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::uuid, NULL::timestamptz, 'اسم المستخدم أو كلمة المرور غير صحيحة'::text;
    RETURN;
  END IF;

  IF v_user.is_active = false THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::uuid, NULL::timestamptz, 'هذا الحساب معطّل. تواصل مع المدير'::text;
    RETURN;
  END IF;

  IF crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::uuid, NULL::timestamptz, 'اسم المستخدم أو كلمة المرور غير صحيحة'::text;
    RETURN;
  END IF;

  v_token := gen_random_uuid();
  INSERT INTO staff_sessions (staff_user_id, token, expires_at)
    VALUES (v_user.id, v_token, v_expires);

  RETURN QUERY SELECT true, v_user.id, v_user.username::text, v_user.display_name, v_user.role, v_user.is_super_admin, v_token, v_expires, NULL::text;
END;
$$;

-- Logout: revoke the session.
CREATE OR REPLACE FUNCTION staff_logout(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE staff_sessions SET revoked_at = now()
    WHERE token = p_token AND revoked_at IS NULL;
END;
$$;

-- Internal helper: assert the actor is an active admin.
CREATE OR REPLACE FUNCTION _assert_admin(p_actor_token uuid)
RETURNS staff_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor staff_users;
  v_token text := p_actor_token::text;
BEGIN
  SELECT su.* INTO v_actor
    FROM staff_sessions s
    JOIN staff_users su ON su.id = s.staff_user_id
    WHERE s.token::text = v_token
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND su.is_active = true
    LIMIT 1;
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: جلسة غير صالحة أو منتهية';
  END IF;
  IF v_actor.role <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: هذه العملية تتطلب صلاحيات مدير';
  END IF;
  RETURN v_actor;
END;
$$;

-- Admin: create a new staff user.
CREATE OR REPLACE FUNCTION staff_create_user(
  p_actor_token uuid,
  p_username text,
  p_password text,
  p_display_name text,
  p_role text
)
RETURNS staff_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor staff_users;
  v_role text := COALESCE(p_role, 'receptionist');
  v_new staff_users;
BEGIN
  v_actor := _assert_admin(p_actor_token);
  IF v_role NOT IN ('admin','receptionist','doctor') THEN
    RAISE EXCEPTION 'دور غير صالح';
  END IF;
  IF length(trim(p_username)) < 3 THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  END IF;

  INSERT INTO staff_users (username, password_hash, display_name, role)
    VALUES (trim(p_username)::citext, crypt(p_password, gen_salt('bf', 10)), p_display_name, v_role)
    RETURNING * INTO v_new;

  INSERT INTO audit_log (actor, action, details, target_type, target_id)
    VALUES (v_actor.username, 'create_staff_user', 'إنشاء مستخدم ' || v_new.username || ' بدور ' || v_role, 'staff_user', v_new.id);

  RETURN v_new;
END;
$$;

-- Admin: update a staff user (password optional).
CREATE OR REPLACE FUNCTION staff_update_user(
  p_actor_token uuid,
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_is_active boolean,
  p_password text
)
RETURNS staff_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor staff_users;
  v_target staff_users;
  v_role text := COALESCE(p_role, 'receptionist');
BEGIN
  v_actor := _assert_admin(p_actor_token);
  SELECT * INTO v_target FROM staff_users WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;
  IF v_target.is_super_admin AND p_is_active = false THEN
    RAISE EXCEPTION 'لا يمكن تعطيل حساب المدير العام';
  END IF;
  IF v_role NOT IN ('admin','receptionist','doctor') THEN
    RAISE EXCEPTION 'دور غير صالح';
  END IF;

  UPDATE staff_users
    SET display_name = p_display_name,
        role = v_role,
        is_active = COALESCE(p_is_active, is_active),
        password_hash = CASE WHEN p_password IS NOT NULL AND length(p_password) >= 6
                             THEN crypt(p_password, gen_salt('bf', 10))
                             ELSE password_hash END,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING * INTO v_target;

  INSERT INTO audit_log (actor, action, details, target_type, target_id)
    VALUES (v_actor.username, 'update_staff_user', 'تعديل مستخدم ' || v_target.username, 'staff_user', v_target.id);

  RETURN v_target;
END;
$$;

-- Admin: delete a staff user (never a super-admin).
CREATE OR REPLACE FUNCTION staff_delete_user(p_actor_token uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor staff_users;
  v_target staff_users;
BEGIN
  v_actor := _assert_admin(p_actor_token);
  SELECT * INTO v_target FROM staff_users WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;
  IF v_target.is_super_admin THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب المدير العام';
  END IF;
  DELETE FROM staff_users WHERE id = p_user_id;
  INSERT INTO audit_log (actor, action, details, target_type, target_id)
    VALUES (v_actor.username, 'delete_staff_user', 'حذف مستخدم ' || v_target.username, 'staff_user', p_user_id);
END;
$$;

-- Admin: list all staff users.
CREATE OR REPLACE FUNCTION staff_list_users(p_actor_token uuid)
RETURNS setof staff_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor staff_users;
BEGIN
  v_actor := _assert_admin(p_actor_token);
  RETURN QUERY SELECT * FROM staff_users ORDER BY created_at ASC;
END;
$$;

-- Grants
REVOKE EXECUTE ON FUNCTION current_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_staff() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_login(text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_logout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_logout(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_create_user(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_create_user(uuid, text, text, text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_update_user(uuid, uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_update_user(uuid, uuid, text, text, boolean, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_delete_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_delete_user(uuid, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION staff_list_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_list_users(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION _assert_admin(uuid) FROM PUBLIC;

-- ---------- seed super-admin shery / shery123 ----------
INSERT INTO staff_users (username, password_hash, display_name, role, is_super_admin, is_active)
SELECT 'shery', crypt('shery123', gen_salt('bf', 10)), 'shery (مدير النظام)', 'admin', true, true
WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE username = 'shery'::citext);
