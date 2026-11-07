import { useEffect, useState, useCallback } from 'react';
import { supabase, type Appointment, type Doctor, type Patient, type Specialty, type AuditLog } from '@/lib/supabase';

// ---- Specialties ----
export function useSpecialties() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('specialties')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) setError(error.message);
    else setSpecialties(data as Specialty[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { specialties, loading, error, refresh };
}

// ---- Doctors (optionally by specialty) ----
export function useDoctors(specialtyId?: string) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('doctors').select('*').order('name', { ascending: true });
    if (specialtyId) q = q.eq('specialty_id', specialtyId);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setDoctors(data as Doctor[]);
    setLoading(false);
  }, [specialtyId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { doctors, loading, error, refresh };
}

// ---- Appointments (optionally filtered by doctor &/or date &/or status) ----
export function useAppointments(opts: {
  doctorId?: string;
  date?: string;
  status?: string;
  patientId?: string;
} = {}) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('appointments')
      .select('*, patient:patients(*), doctor:doctors(*), specialty:specialties(*)')
      .order('appointment_time', { ascending: true });
    if (opts.doctorId) q = q.eq('doctor_id', opts.doctorId);
    if (opts.date) q = q.eq('appointment_date', opts.date);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setItems(data as Appointment[]);
    setLoading(false);
  }, [opts.doctorId, opts.date, opts.status, opts.patientId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { items, loading, error, refresh };
}

// ---- Patients ----
export function usePatients(search?: string) {
  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(200);
    if (search && search.trim()) {
      q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,national_id.ilike.%${search.trim()}%`);
    }
    const { data } = await q;
    setItems((data as Patient[]) ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { items, loading, refresh };
}

// ---- Audit log ----
export function useAuditLog(limit = 50) {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    setItems((data as AuditLog[]) ?? []);
    setLoading(false);
  }, [limit]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { items, loading, refresh };
}

// ---- Mutations ----

export async function logAudit(action: string, details: string, targetType?: string, targetId?: string, actor = 'shery') {
  await supabase.from('audit_log').insert({
    action,
    details,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    actor,
  });
}

export async function findOrCreatePatient(input: {
  name: string;
  phone?: string;
  national_id?: string;
  gender?: string;
  birth_year?: number;
}): Promise<Patient | null> {
  if (!input.name.trim()) return null;

  // Try to match existing by phone or national_id first
  if (input.phone || input.national_id) {
    const orParts: string[] = [];
    if (input.phone) orParts.push(`phone.eq.${input.phone}`);
    if (input.national_id) orParts.push(`national_id.eq.${input.national_id}`);
    const { data: existing } = await supabase
      .from('patients')
      .select('*')
      .or(orParts.join(','))
      .limit(1)
      .maybeSingle();
    if (existing) return existing as Patient;
  }

  const { data, error } = await supabase
    .from('patients')
    .insert({
      name: input.name.trim(),
      phone: input.phone || null,
      national_id: input.national_id || null,
      gender: (input.gender as Patient['gender']) || null,
      birth_year: input.birth_year ?? null,
    })
    .select('*')
    .single();
  if (error) {
    // race condition: someone else inserted. try to fetch.
    if (input.phone) {
      const { data: existing } = await supabase
        .from('patients')
        .select('*')
        .eq('phone', input.phone)
        .limit(1)
        .maybeSingle();
      if (existing) return existing as Patient;
    }
    return null;
  }
  return data as Patient;
}

export async function nextTurnNumber(doctorId: string, date: string): Promise<number> {
  const { data, error } = await supabase
    .from('appointments')
    .select('turn_number')
    .eq('doctor_id', doctorId)
    .eq('appointment_date', date)
    .order('turn_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return 1;
  return (data?.turn_number ?? 0) + 1;
}

export async function createAppointment(input: {
  patient_id: string;
  doctor_id: string;
  specialty_id: string | null;
  appointment_date: string;
  appointment_time: string;
  notes?: string;
  booked_via?: string;
}): Promise<{ appointment: Appointment | null; error: string | null }> {
  const turn_number = await nextTurnNumber(input.doctor_id, input.appointment_date);
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: input.patient_id,
      doctor_id: input.doctor_id,
      specialty_id: input.specialty_id,
      appointment_date: input.appointment_date,
      appointment_time: input.appointment_time,
      turn_number,
      status: 'confirmed',
      notes: input.notes ?? null,
      booked_via: input.booked_via ?? 'patient',
    })
    .select('*, patient:patients(*), doctor:doctors(*), specialty:specialties(*)')
    .single();
  if (error) return { appointment: null, error: error.message };
  await logAudit('create_appointment', `حجز موعد رقم ${turn_number} بتاريخ ${input.appointment_date}`, 'appointment', data.id);
  return { appointment: data as Appointment, error: null };
}

export async function updateAppointmentStatus(id: string, status: string, actor = 'shery') {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (!error) {
    await logAudit('update_appointment', `تحديث حالة الموعد إلى ${status}`, 'appointment', id, actor);
  }
  return { error };
}

export async function cancelAppointment(id: string) {
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
  if (!error) await logAudit('cancel_appointment', 'إلغاء موعد', 'appointment', id);
  return { error };
}

// ---- Public patient lookup by phone (no auth required) ----
// Returns active (non-cancelled, non-completed) appointments for the patient(s)
// matching the phone number, joined with doctor + specialty.
export async function lookupAppointmentsByPhone(phone: string): Promise<{
  appointments: Appointment[];
  error: string | null;
}> {
  const q = phone.trim();
  if (!q) return { appointments: [], error: null };
  const { data, error } = await supabase
    .from('appointments')
    .select('*, patient:patients(*), doctor:doctors(*), specialty:specialties(*)')
    .in('status', ['confirmed', 'pending', 'in_progress'])
    .order('appointment_date', { ascending: false })
    .order('appointment_time', { ascending: true });
  if (error) return { appointments: [], error: error.message };
  const all = (data as Appointment[]) ?? [];
  // Filter on the joined patient's phone (case-insensitive contains).
  const filtered = all.filter((a) => {
    const p = a.patient?.phone ?? '';
    return p && p.replace(/\s/g, '').includes(q.replace(/\s/g, ''));
  });
  return { appointments: filtered, error: null };
}

