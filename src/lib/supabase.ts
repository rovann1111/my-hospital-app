import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars missing. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Plain client for public (patient) operations — no staff token header.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// ---- Domain types ----

export type Specialty = {
  id: string;
  name: string;
  name_en: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  display_order: number;
};

export type Doctor = {
  id: string;
  name: string;
  title: string | null;
  specialty_id: string | null;
  bio: string | null;
  room: string | null;
  available_days: number[];
  shift_start: string; // "HH:MM:SS"
  shift_end: string;
  slot_minutes: number;
  consultation_fee: number;
  status: 'active' | 'inactive';
  created_at: string;
};

export type Patient = {
  id: string;
  name: string;
  phone: string | null;
  national_id: string | null;
  gender: 'male' | 'female' | null;
  birth_year: number | null;
  created_at: string;
};

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  appointment_date: string; // "YYYY-MM-DD"
  appointment_time: string; // "HH:MM:SS"
  turn_number: number;
  status: AppointmentStatus;
  notes: string | null;
  booked_via: string;
  created_at: string;
  // joined
  patient?: Patient;
  doctor?: Doctor;
  specialty?: Specialty;
};

export type AuditLog = {
  id: string;
  actor: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
};

export type StaffRole = 'admin' | 'receptionist' | 'doctor';

export type StaffUser = {
  id: string;
  username: string;
  display_name: string | null;
  role: StaffRole;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

