import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Stethoscope, CalendarDays, Activity, Plus, Pencil, Trash2,
  TrendingUp, History, Save, UserCog, Users, KeyRound, Power, AlertCircle,
  Clock, X,
} from 'lucide-react';
import {
  useDoctors, useSpecialties, useAppointments, useAuditLog, logAudit,
} from '@/hooks/useData';
import { useAuth, staffStorage } from '@/hooks/useAuth';
import type { Doctor, Specialty, StaffUser } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { Button, Card, Loading, EmptyState, Badge, Modal, Field, inputCls } from '@/components/ui';
import { specialtyIcon, toneOf, SPECIALTY_ICONS } from '@/lib/icons';
import { WEEKDAY_AR_SHORT, todayValue } from '@/lib/utils';

type AdminTab = 'dashboard' | 'doctors' | 'specialties' | 'users' | 'log';

const ROLE_LABEL: Record<StaffUser['role'], string> = {
  admin: 'مدير',
  receptionist: 'استقبال',
  doctor: 'طبيب',
};

export function Admin() {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" /> لوحة الإدارة
            </h2>
            <p className="text-xs text-slate-500 mt-1">إدارة المستخدمين، الأطباء، التخصصات وسجل العمليات</p>
          </div>
          <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
            {([['dashboard', 'الإحصائيات'], ['doctors', 'الأطباء'], ['specialties', 'التخصصات'], ['users', 'إدارة المستخدمين'], ['log', 'سجل العمليات']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === id ? 'bg-white text-hospital-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'doctors' && <DoctorsAdmin />}
      {tab === 'specialties' && <SpecialtiesAdmin />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'log' && <AuditLogView />}
    </div>
  );
}

// ---- Dashboard ----
function Dashboard() {
  const today = todayValue();
  const { doctors } = useDoctors();
  const { specialties } = useSpecialties();
  const { items: todayAppts } = useAppointments({ date: today });
  const { items: audit } = useAuditLog(10);

  const stats = useMemo(() => {
    const total = todayAppts.length;
    const done = todayAppts.filter((a) => a.status === 'completed').length;
    const waiting = todayAppts.filter((a) => a.status === 'confirmed' || a.status === 'pending').length;
    const inProg = todayAppts.filter((a) => a.status === 'in_progress').length;
    return { total, done, waiting, inProg };
  }, [todayAppts]);

  const topSpecialties = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; count: number }>();
    for (const a of todayAppts) {
      const s = a.specialty;
      if (!s) continue;
      const cur = map.get(s.id) ?? { name: s.name, color: s.color, count: 0 };
      cur.count += 1;
      map.set(s.id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [todayAppts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBig label="أطباء نشطون" value={doctors.filter((d) => d.status === 'active').length} icon={<Stethoscope className="w-5 h-5" />} tone="teal" />
        <StatBig label="التخصصات" value={specialties.length} icon={<Activity className="w-5 h-5" />} tone="sky" />
        <StatBig label="مواعيد اليوم" value={stats.total} icon={<CalendarDays className="w-5 h-5" />} tone="amber" />
        <StatBig label="مكتملة اليوم" value={stats.done} icon={<TrendingUp className="w-5 h-5" />} tone="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-hospital-600" /> ملخص اليوم</h3>
          <div className="space-y-3">
            <ProgressBar label="تم الكشف" value={stats.done} total={stats.total || 1} tone="bg-emerald-500" />
            <ProgressBar label="داخل العيادة" value={stats.inProg} total={stats.total || 1} tone="bg-amber-500" />
            <ProgressBar label="في الانتظار" value={stats.waiting} total={stats.total || 1} tone="bg-sky-500" />
          </div>
          {stats.total === 0 && <p className="text-sm text-slate-400 text-center py-4">لا توجد مواعيد مسجّلة اليوم.</p>}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-hospital-600" /> أكثر التخصصات حجوزاً اليوم</h3>
          {topSpecialties.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">لا توجد بيانات كافية.</p>
          ) : (
            <div className="space-y-2">
              {topSpecialties.map((s, i) => {
                const tone = toneOf(s.color);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${tone.bg} ${tone.text} flex items-center justify-center text-xs font-bold`}>{i + 1}</div>
                    <span className="flex-1 text-sm font-semibold text-slate-700">{s.name}</span>
                    <Badge tone="slate">{s.count} حجز</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><History className="w-4 h-4 text-hospital-600" /> آخر العمليات</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">لا توجد عمليات مسجّلة.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {audit.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                <div className="w-2 h-2 rounded-full bg-hospital-400 mt-2 shrink-0" />
                <div className="flex-1">
                  <p className="text-slate-700"><span className="font-semibold">{a.action}</span> — {a.details}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{a.actor ?? 'shery'} · {new Date(a.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatBig({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'teal' | 'sky' | 'amber' | 'emerald' }) {
  const tones: Record<string, string> = {
    teal: 'from-hospital-500 to-hospital-700',
    sky: 'from-sky-500 to-sky-700',
    amber: 'from-amber-400 to-amber-600',
    emerald: 'from-emerald-500 to-emerald-700',
  };
  return (
    <Card className="p-0 overflow-hidden">
      <div className={`bg-gradient-to-br ${tones[tone]} text-white p-4`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold opacity-90">{label}</span>
          <span className="opacity-90">{icon}</span>
        </div>
        <p className="text-3xl font-extrabold mt-2">{value}</p>
      </div>
    </Card>
  );
}

function ProgressBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600 font-semibold">{label}</span>
        <span className="text-slate-400">{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---- Doctors Admin ----
function DoctorsAdmin() {
  const { doctors, loading, refresh } = useDoctors();
  const { specialties } = useSpecialties();
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleStatus(d: Doctor) {
    const next = d.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('doctors').update({ status: next }).eq('id', d.id);
    if (!error) await logAudit('toggle_doctor', `${next === 'active' ? 'تفعيل' : 'إيقاف'} الطبيب ${d.name}`, 'doctor', d.id);
    void refresh();
  }

  async function remove(d: Doctor) {
    if (!confirm(`حذف الطبيب ${d.name}؟ سيتم حذف مواعيده أيضاً.`)) return;
    const { error } = await supabase.from('doctors').delete().eq('id', d.id);
    if (!error) await logAudit('delete_doctor', `حذف الطبيب ${d.name}`, 'doctor', d.id);
    void refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Stethoscope className="w-4 h-4 text-hospital-600" /> الأطباء ({doctors.length})</h3>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> طبيب جديد</Button>
      </div>

      {loading ? (
        <Loading />
      ) : doctors.length === 0 ? (
        <EmptyState icon={<Stethoscope className="w-7 h-7" />} title="لا يوجد أطباء" subtitle="أضف أول طبيب." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-slate-500 border-b border-slate-100">
                <th className="text-start font-semibold py-2 px-2">الطبيب</th>
                <th className="text-start font-semibold py-2 px-2">التخصص</th>
                <th className="text-start font-semibold py-2 px-2">الغرفة</th>
                <th className="text-start font-semibold py-2 px-2">الأيام</th>
                <th className="text-start font-semibold py-2 px-2">الرسوم</th>
                <th className="text-start font-semibold py-2 px-2">الحالة</th>
                <th className="text-end font-semibold py-2 px-2">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((d) => {
                const spec = specialties.find((s) => s.id === d.specialty_id);
                return (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-2">
                      <p className="font-bold text-slate-800">{d.name}</p>
                      <p className="text-xs text-slate-400">{d.title}</p>
                    </td>
                    <td className="py-2.5 px-2 text-slate-600">{spec?.name ?? '—'}</td>
                    <td className="py-2.5 px-2 text-slate-600">{d.room ?? '—'}</td>
                    <td className="py-2.5 px-2 text-xs text-slate-500">{d.available_days.map((x) => WEEKDAY_AR_SHORT[x]).join('، ')}</td>
                    <td className="py-2.5 px-2 text-slate-600">{d.consultation_fee} ر.س</td>
                    <td className="py-2.5 px-2">
                      {d.status === 'active'
                        ? <Badge tone="emerald">نشط</Badge>
                        : <Badge tone="rose">متوقف</Badge>}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(d)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="تعديل"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => toggleStatus(d)} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50" title="تفعيل/إيقاف"><UserCog className="w-4 h-4" /></button>
                        <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <DoctorModal
          doctor={editing}
          specialties={specialties}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void refresh(); }}
        />
      )}
    </Card>
  );
}

function DoctorModal({
  doctor, specialties, onClose, onSaved,
}: {
  doctor: Doctor | null; specialties: Specialty[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!doctor;
  const [form, setForm] = useState({
    name: doctor?.name ?? '',
    title: doctor?.title ?? 'استشاري',
    specialty_id: doctor?.specialty_id ?? specialties[0]?.id ?? '',
    bio: doctor?.bio ?? '',
    room: doctor?.room ?? '',
    available_days: doctor?.available_days ?? [0, 1, 2, 3, 4],
    shift_start: (doctor?.shift_start ?? '09:00:00').slice(0, 5),
    shift_end: (doctor?.shift_end ?? '14:00:00').slice(0, 5),
    slot_minutes: doctor?.slot_minutes ?? 15,
    consultation_fee: doctor?.consultation_fee ?? 100,
    status: doctor?.status ?? 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(d: number) {
    setForm((f) => ({
      ...f,
      available_days: f.available_days.includes(d) ? f.available_days.filter((x) => x !== d) : [...f.available_days, d].sort(),
    }));
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) { setError('أدخل اسم الطبيب'); return; }
    if (form.available_days.length === 0) { setError('اختر يوماً واحداً على الأقل'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      title: form.title,
      specialty_id: form.specialty_id || null,
      bio: form.bio || null,
      room: form.room || null,
      available_days: form.available_days,
      shift_start: `${form.shift_start}:00`,
      shift_end: `${form.shift_end}:00`,
      slot_minutes: Number(form.slot_minutes),
      consultation_fee: Number(form.consultation_fee),
      status: form.status,
    };
    const { error: err } = isEdit
      ? await supabase.from('doctors').update(payload).eq('id', doctor!.id)
      : await supabase.from('doctors').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await logAudit(isEdit ? 'update_doctor' : 'create_doctor', `${isEdit ? 'تعديل' : 'إضافة'} الطبيب ${form.name}`, 'doctor', doctor?.id);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'تعديل بيانات الطبيب' : 'إضافة طبيب جديد'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="الاسم" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="الدرجة العلمية">
            <select value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls}>
              <option value="استشاري">استشاري</option>
              <option value="أخصائي">أخصائي</option>
              <option value="طبيب مقيم">طبيب مقيم</option>
              <option value="بروفيسور">بروفيسور</option>
            </select>
          </Field>
          <Field label="التخصص">
            <select value={form.specialty_id} onChange={(e) => setForm({ ...form, specialty_id: e.target.value })} className={inputCls}>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="الغرفة"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="A-101" className={inputCls} /></Field>
        </div>
        <Field label="نبذة"><textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} className={inputCls} /></Field>

        <Field label="أيام العمل" required>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_AR_SHORT.map((label, i) => {
              const active = form.available_days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    active ? 'bg-hospital-600 text-white border-hospital-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {WEEKDAY_AR_SHORT[i]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="بداية الدوام"><input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} className={inputCls} /></Field>
          <Field label="نهاية الدوام"><input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} className={inputCls} /></Field>
          <Field label="مدة الكشف (د)"><input type="number" min={5} step={5} value={form.slot_minutes} onChange={(e) => setForm({ ...form, slot_minutes: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="الرسوم (ر.س)"><input type="number" min={0} value={form.consultation_fee} onChange={(e) => setForm({ ...form, consultation_fee: Number(e.target.value) })} className={inputCls} /></Field>
        </div>

        <Field label="الحالة">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Doctor['status'] })} className={inputCls}>
            <option value="active">نشط</option>
            <option value="inactive">متوقف</option>
          </select>
        </Field>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'جاري الحفظ...' : <><Save className="w-4 h-4" /> حفظ</>}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Specialties Admin ----
function SpecialtiesAdmin() {
  const { specialties, loading, refresh } = useSpecialties();
  const { doctors } = useDoctors();
  const [editing, setEditing] = useState<Specialty | null>(null);
  const [creating, setCreating] = useState(false);

  async function remove(s: Specialty) {
    const linked = doctors.filter((d) => d.specialty_id === s.id).length;
    if (linked > 0) { alert(`لا يمكن حذف ${s.name} لأن هناك ${linked} طبيب مرتبط به. نقل الأطباء أولاً.`); return; }
    if (!confirm(`حذف تخصص ${s.name}؟`)) return;
    const { error } = await supabase.from('specialties').delete().eq('id', s.id);
    if (!error) await logAudit('delete_specialty', `حذف التخصص ${s.name}`, 'specialty', s.id);
    void refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity className="w-4 h-4 text-hospital-600" /> التخصصات ({specialties.length})</h3>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> تخصص جديد</Button>
      </div>

      {loading ? <Loading /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {specialties.map((s) => {
            const Icon = specialtyIcon(s.icon);
            const tone = toneOf(s.color);
            const count = doctors.filter((d) => d.specialty_id === s.id).length;
            return (
              <div key={s.id} className="rounded-2xl border border-slate-100 p-4 bg-white">
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(s)} className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(s)} className="p-1 rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <h4 className="font-bold text-slate-800 mt-2">{s.name}</h4>
                {s.description && <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{s.description}</p>}
                <Badge tone="slate" className="mt-2">{count} طبيب</Badge>
              </div>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <SpecialtyModal
          specialty={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void refresh(); }}
        />
      )}
    </Card>
  );
}

function SpecialtyModal({ specialty, onClose, onSaved }: { specialty: Specialty | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!specialty;
  const iconNames = Object.keys(SPECIALTY_ICONS);
  const colors = ['rose', 'amber', 'sky', 'pink', 'teal', 'violet', 'cyan', 'lime', 'indigo', 'blue'];
  const [form, setForm] = useState({
    name: specialty?.name ?? '',
    name_en: specialty?.name_en ?? '',
    icon: specialty?.icon ?? 'stethoscope',
    color: specialty?.color ?? 'teal',
    description: specialty?.description ?? '',
    display_order: specialty?.display_order ?? (Date.now() % 1000),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!form.name.trim()) { setError('أدخل اسم التخصص'); return; }
    setSaving(true);
    const payload = { ...form, name: form.name.trim() };
    const { error: err } = isEdit
      ? await supabase.from('specialties').update(payload).eq('id', specialty!.id)
      : await supabase.from('specialties').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await logAudit(isEdit ? 'update_specialty' : 'create_specialty', `${isEdit ? 'تعديل' : 'إضافة'} التخصص ${form.name}`, 'specialty', specialty?.id);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'تعديل التخصص' : 'إضافة تخصص'} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="الاسم (عربي)" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="الاسم (إنجليزي)"><input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="الوصف"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} /></Field>
        <Field label="الأيقونة">
          <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
            {iconNames.map((n) => {
              const Icon = SPECIALTY_ICONS[n];
              const active = form.icon === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm({ ...form, icon: n })}
                  className={`aspect-square rounded-lg flex items-center justify-center border transition ${
                    active ? 'bg-hospital-600 text-white border-hospital-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="اللون">
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const tone = toneOf(c);
              const active = form.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full ${tone.solid} transition ${active ? 'ring-4 ring-offset-2 ring-slate-300' : ''}`}
                />
              );
            })}
          </div>
        </Field>
        <Field label="ترتيب العرض"><input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} className={inputCls} /></Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> حفظ</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Audit Log ----
function AuditLogView() {
  const { items, loading, refresh } = useAuditLog(100);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً؟')) return;
    setDeleting(id);
    const { error } = await supabase.from('audit_log').delete().eq('id', id);
    setDeleting(null);
    if (error) { alert('حدث خطأ أثناء الحذف'); return; }
    void refresh();
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xl font-bold text-hospital-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-hospital-600" /> سجل العمليات
        </h3>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          إجمالي السجلات: {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={<History className="w-7 h-7" />} title="لا توجد عمليات مسجّلة" />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div
              key={a.id}
              className="group flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white hover:border-hospital-200 hover:bg-hospital-50/30 transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-hospital-500 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-hospital-800 dir-ltr">{a.action}</span>
                    <span className="text-slate-400">—</span>
                    <span className="text-sm text-slate-700 font-medium">{a.details}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>{new Date(a.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <span>•</span>
                    <span className="font-semibold text-slate-500">{a.actor ?? 'shery'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={deleting === a.id}
                title="حذف السجل نهائياً"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center disabled:opacity-40"
              >
                {deleting === a.id
                  ? <div className="w-4 h-4 border-2 border-slate-300 border-t-rose-500 rounded-full animate-spin" />
                  : <X className="w-5 h-5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- User Management ----
function UsersAdmin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await staffStorage.list();
      setUsers(data);
    } catch {
      setError('فشل تحميل قائمة المستخدمين');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(u: StaffUser) {
    if (u.username === 'shery') {
      alert('لا يمكن حذف حساب الأدمن الأساسي');
      return;
    }
    if (!confirm(`حذف المستخدم ${u.username}؟`)) return;
    const res = await staffStorage.remove(u.id);
    if (res.error) {
      alert(res.error);
      return;
    }
    await refresh();
  }

  if (!user || user.role !== 'admin') {
    return (
      <Card className="p-6">
        <EmptyState icon={<ShieldCheck className="w-7 h-7" />} title="صلاحيات غير كافية" subtitle="هذا القسم مخصص للمديرين فقط." />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-hospital-600" /> المستخدمون ({users.length})
        </h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> مستخدم جديد
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="w-7 h-7" />} title="لا يوجد مستخدمون" subtitle="أضف أول مستخدم." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-slate-500 border-b border-slate-100">
                <th className="text-start font-semibold py-2 px-2">اسم المستخدم</th>
                <th className="text-start font-semibold py-2 px-2">الصلاحية / الدور</th>
                <th className="text-start font-semibold py-2 px-2">تاريخ الإضافة</th>
                <th className="text-end font-semibold py-2 px-2">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-2 font-bold text-slate-800">{u.username}</td>
                  <td className="py-2.5 px-2">
                    <Badge tone={u.role === 'admin' ? 'emerald' : 'sky'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
                  </td>
                  <td className="py-2.5 px-2 text-xs text-slate-400">
                    {u.created_at ? new Date(u.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(u)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        title="تعديل"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(u)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <UserModal
          user={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await refresh();
          }}
        />
      )}
    </Card>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username ?? '',
    password: '',
    role: user?.role ?? ('receptionist' as StaffUser['role']),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);

    if (isEdit) {
      const res = await staffStorage.update({
        id: user!.id,
        role: form.role,
        password: form.password,
      });
      setSaving(false);
      if (res.error) {
        setError(res.error);
        return;
      }
    } else {
      const res = await staffStorage.add({
        username: form.username,
        password: form.password,
        role: form.role,
      });
      setSaving(false);
      if (res.error) {
        setError(res.error);
        return;
      }
    }

    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'} maxWidth="max-w-md">
      <div className="space-y-4">
        {!isEdit && (
          <Field label="اسم المستخدم" required>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={inputCls}
              placeholder="مثال: Ahmed"
            />
          </Field>
        )}
        <Field label={isEdit ? 'كلمة المرور الجديدة (اختياري)' : 'كلمة المرور'} required={!isEdit}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputCls}
            placeholder="6 أحرف على الأقل"
          />
        </Field>
        <Field label="الصلاحية">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as StaffUser['role'] })}
            className={inputCls}
          >
            <option value="admin">مدير (Admin)</option>
            <option value="receptionist">استقبال (Receptionist)</option>
            <option value="doctor">طبيب (Doctor)</option>
          </select>
        </Field>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'جاري الحفظ...' : <><Save className="w-4 h-4" /> حفظ</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}