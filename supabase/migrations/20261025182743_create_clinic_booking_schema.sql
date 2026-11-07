/*
# Create outpatient clinic booking system schema

## Overview
Hospital outpatient clinic booking & management system (مستشفى السلام التخصصي).
Single-tenant, no-auth app: data is intentionally shared/public across the
hospital staff and self-service patient kiosks, so all policies use
TO anon, authenticated with USING (true).

## New Tables

1. `specialties` — Medical specialties (e.g. قلب، عظام، أطفال)
   - id (uuid PK)
   - name (text, not null) — Arabic display name
   - name_en (text) — English slug for icon selection
   - icon (text) — lucide-react icon name
   - color (text) — tailwind color token for the card
   - description (text)
   - display_order (int, default 0)
   - created_at (timestamptz)

2. `doctors` — Doctors affiliated with a specialty
   - id (uuid PK)
   - name (text, not null)
   - title (text) — e.g. استشاري, أخصائي
   - specialty_id (uuid FK -> specialties)
   - bio (text)
   - room (text) — clinic room number
   - available_days (int[]) — weekday numbers 0=Sun..6=Sat
   - shift_start (time, default 09:00)
   - shift_end (time, default 14:00)
   - slot_minutes (int, default 15) — appointment duration
   - consultation_fee (numeric, default 0)
   - status (text, default 'active') — active | inactive
   - created_at (timestamptz)

3. `patients` — Patient directory (created at booking or reception)
   - id (uuid PK)
   - name (text, not null)
   - phone (text)
   - national_id (text)
   - gender (text) — male | female
   - birth_year (int)
   - created_at (timestamptz)

4. `appointments` — Clinic bookings / turns
   - id (uuid PK)
   - patient_id (uuid FK -> patients)
   - doctor_id (uuid FK -> doctors)
   - specialty_id (uuid FK -> specialties)
   - appointment_date (date, not null)
   - appointment_time (time, not null)
   - turn_number (int, not null) — daily per-doctor sequence
   - status (text, not null, default 'pending') — pending|confirmed|in_progress|completed|cancelled|no_show
   - notes (text)
   - booked_via (text, default 'patient') — patient | reception | admin
   - created_at (timestamptz)

5. `audit_log` — Lightweight admin action log
   - id (uuid PK)
   - actor (text) — who performed the action
   - action (text) — e.g. create_doctor, cancel_appointment
   - target_type (text)
   - target_id (uuid)
   - details (text)
   - created_at (timestamptz)

## Security
- RLS enabled on every table.
- GRANT CRUD to anon, authenticated (single-tenant, shared data).
- Policies use USING (true) because the app is intentionally public/shared
  (no sign-in, hospital-wide kiosk/staff access). This is documented here
  as intentional, not as a fallback around ownership checks.
- service_role granted CRUD for any future edge functions.

## Notes
- Turn numbers are computed in the app as max(turn_number)+1 per
  (doctor_id, appointment_date) at insert time; a partial unique index
  enforces uniqueness per doctor per day so concurrent inserts fail loudly
  rather than silently collide.
*/

-- ---------- specialties ----------
CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  icon text,
  color text,
  description text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON specialties TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON specialties TO service_role;
DROP POLICY IF EXISTS "anon_rw_specialties" ON specialties;
CREATE POLICY "anon_rw_specialties" ON specialties
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- doctors ----------
CREATE TABLE IF NOT EXISTS doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text,
  specialty_id uuid REFERENCES specialties(id) ON DELETE SET NULL,
  bio text,
  room text,
  available_days int[] NOT NULL DEFAULT ARRAY[0,1,2,3,4]::int[],
  shift_start time NOT NULL DEFAULT '09:00'::time,
  shift_end time NOT NULL DEFAULT '14:00'::time,
  slot_minutes int NOT NULL DEFAULT 15,
  consultation_fee numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON doctors TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON doctors TO service_role;
DROP POLICY IF EXISTS "anon_rw_doctors" ON doctors;
CREATE POLICY "anon_rw_doctors" ON doctors
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- patients ----------
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  national_id text,
  gender text,
  birth_year int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON patients TO service_role;
DROP POLICY IF EXISTS "anon_rw_patients" ON patients;
CREATE POLICY "anon_rw_patients" ON patients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- appointments ----------
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES doctors(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES specialties(id) ON DELETE SET NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  turn_number int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  booked_via text NOT NULL DEFAULT 'patient',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO service_role;
DROP POLICY IF EXISTS "anon_rw_appointments" ON appointments;
CREATE POLICY "anon_rw_appointments" ON appointments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Unique turn per doctor per day
DROP INDEX IF EXISTS appointments_doctor_date_turn_uniq;
CREATE UNIQUE INDEX appointments_doctor_date_turn_uniq
  ON appointments (doctor_id, appointment_date, turn_number);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS appointments_doctor_date_idx
  ON appointments (doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS appointments_date_status_idx
  ON appointments (appointment_date, status);
CREATE INDEX IF NOT EXISTS appointments_patient_idx
  ON appointments (patient_id);

-- ---------- audit_log ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log TO service_role;
DROP POLICY IF EXISTS "anon_rw_audit_log" ON audit_log;
CREATE POLICY "anon_rw_audit_log" ON audit_log
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- seed specialties ----------
INSERT INTO specialties (name, name_en, icon, color, description, display_order)
VALUES
  ('القلب والأوعية',    'cardiology',    'heart-pulse',        'rose',    'أمراض القلب والضغط والأوعية الدموية',                 1),
  ('العظام',            'orthopedics',   'bone',               'amber',   'إصابات وعيوب العظام والمفاصل',                        2),
  ('الأطفال',           'pediatrics',    'baby',               'sky',     'رعاية صحية متكاملة للأطفال وحديثي الولادة',          3),
  ('النساء والولادة',   'gynecology',    'flower-2',           'pink',    'متابعة الحمل والولادة وأمراض النساء',                 4),
  ('الباطنة',           'internal',      'stethoscope',        'teal',    'أمراض الجهاز الهضمي والكلى والسكري',                  5),
  ('الجلدية',           'dermatology',   'sparkles',           'violet',  'أمراض الجلد والتجميل',                                6),
  ('الأنف والأذن',      'ent',           'ear',                'cyan',    'أمراض الأنف والأذن والحنجرة',                         7),
  ('الأسنان',           'dental',        'smile',              'lime',    'علاج وتركيب وتجميل الأسنان',                          8),
  ('العيون',            'ophthalmology', 'eye',                'indigo',  'فحص وعلاج أمراض العيون',                              9),
  ('المسالك البولية',   'urology',       'droplets',           'blue',    'أمراض الكلى والمثانة والمسالك البولية',              10)
ON CONFLICT DO NOTHING;

-- ---------- seed a few doctors ----------
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. أحمد منصور', 'استشاري', id, 'استشاري أمراض القلب والقسطرة - خبرة 20 عاماً', 'A-101', ARRAY[0,1,2,3,4]::int[], '09:00'::time, '14:00'::time, 15, 150, 'active' FROM specialties WHERE name_en='cardiology' LIMIT 1
ON CONFLICT DO NOTHING;
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. سارة الحسن', 'أخصائي', id, 'أخصائي أمراض القلب للأطفال', 'A-102', ARRAY[1,2,3,4,5]::int[], '10:00'::time, '15:00'::time, 20, 120, 'active' FROM specialties WHERE name_en='cardiology' LIMIT 1
ON CONFLICT DO NOTHING;
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. خالد العتيبي', 'استشاري', id, 'استشاري جراحة العظام والمفاصل', 'B-201', ARRAY[0,2,4]::int[], '09:00'::time, '13:00'::time, 15, 180, 'active' FROM specialties WHERE name_en='orthopedics' LIMIT 1
ON CONFLICT DO NOTHING;
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. منى السيد', 'استشاري', id, 'استشارية طب الأطفال وحديثي الولادة', 'C-301', ARRAY[0,1,2,3,4,5]::int[], '08:30'::time, '14:30'::time, 15, 100, 'active' FROM specialties WHERE name_en='pediatrics' LIMIT 1
ON CONFLICT DO NOTHING;
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. ليلى فؤاد', 'استشاري', id, 'استشارية النساء والولادة والعقم', 'D-401', ARRAY[1,3,5]::int[], '10:00'::time, '16:00'::time, 20, 200, 'active' FROM specialties WHERE name_en='gynecology' LIMIT 1
ON CONFLICT DO NOTHING;
INSERT INTO doctors (name, title, specialty_id, bio, room, available_days, shift_start, shift_end, slot_minutes, consultation_fee, status)
SELECT 'د. عمر الشريف', 'استشاري', id, 'استشاري أمراض الباطنة والجهاز الهضمي', 'E-501', ARRAY[0,1,2,3]::int[], '09:00'::time, '13:00'::time, 15, 130, 'active' FROM specialties WHERE name_en='internal' LIMIT 1
ON CONFLICT DO NOTHING;
