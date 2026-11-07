import { useMemo, useState } from 'react';
import {
  Search, CalendarDays, ClipboardList, CheckCircle2, XCircle, Play, Clock, UserPlus,
  Phone, User, IdCard, Stethoscope, ArrowRight, Filter, Printer, FileSpreadsheet,
} from 'lucide-react';
import { useAppointments, useDoctors, useSpecialties, findOrCreatePatient, createAppointment, updateAppointmentStatus, cancelAppointment } from '@/hooks/useData';
import type { Appointment, AppointmentStatus, Doctor, Specialty } from '@/lib/supabase';
import { Button, Card, Loading, EmptyState, Badge, Modal, Field, inputCls } from '@/components/ui';
import { specialtyIcon, toneOf } from '@/lib/icons';
import { buildSlotsForDoctor, formatTime12h, todayValue, formatArDateLong, weekdayOf } from '@/lib/utils';

const STATUS_META: Record<AppointmentStatus, { label: string; tone: 'slate' | 'teal' | 'amber' | 'rose' | 'sky' | 'emerald' | 'violet' }> = {
  pending:     { label: 'في الانتظار', tone: 'slate' },
  confirmed:   { label: 'مؤكد',       tone: 'sky' },
  in_progress: { label: 'في الكشف',   tone: 'amber' },
  completed:   { label: 'مكتمل',      tone: 'emerald' },
  cancelled:   { label: 'ملغي',       tone: 'rose' },
  no_show:     { label: 'لم يحضر',    tone: 'violet' },
};

function exportToExcel(appts: Appointment[], dateStr: string) {
  const headers = ['#', 'اسم المريض', 'الهاتف', 'رقم الهوية', 'الطبيب', 'التخصص', 'الوقت', 'الحالة', 'الغرفة'];
  const rows = appts.map((a) => [
    a.turn_number,
    a.patient?.name ?? '',
    a.patient?.phone ?? '',
    a.patient?.national_id ?? '',
    `${a.doctor?.title ?? ''} ${a.doctor?.name ?? ''}`.trim(),
    a.specialty?.name ?? '',
    formatTime12h(a.appointment_time),
    STATUS_META[a.status].label,
    a.doctor?.room ?? '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `appointments_${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function printAppointments(appts: Appointment[], dateStr: string) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const rows = appts.map((a) => `
    <tr>
      <td style="text-align:center;font-weight:bold">${a.turn_number}</td>
      <td>${a.patient?.name ?? ''}</td>
      <td>${a.patient?.phone ?? ''}</td>
      <td>${a.doctor?.title ?? ''} ${a.doctor?.name ?? ''}</td>
      <td>${a.specialty?.name ?? ''}</td>
      <td>${formatTime12h(a.appointment_time)}</td>
      <td>${STATUS_META[a.status].label}</td>
    </tr>`).join('');
  win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير المواعيد</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#1e293b}
      h1{font-size:20px;text-align:center;margin-bottom:4px}
      .date{text-align:center;color:#64748b;font-size:14px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#0d9488;color:#fff;padding:8px;font-weight:600}
      td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
      tr:nth-child(even){background:#f8fafc}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>تقرير مواعيد العيادة</h1>
    <p class="date">${dateStr}</p>
    <table><thead><tr>
      <th>#</th><th>المريض</th><th>الهاتف</th><th>الطبيب</th><th>التخصص</th><th>الوقت</th><th>الحالة</th>
    </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function Reception() {
  const [date, setDate] = useState<string>(todayValue());
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [bookOpen, setBookOpen] = useState(false);

  const { items, loading, refresh } = useAppointments({ date });

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== 'all') list = list.filter((a) => a.status === filterStatus);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(
        (a) =>
          a.patient?.name?.includes(q) ||
          a.patient?.phone?.includes(q) ||
          a.patient?.national_id?.includes(q) ||
          String(a.turn_number).includes(q),
      );
    }
    return list;
  }, [items, filterStatus, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((a) => a.status === 'completed').length;
    const inProg = items.filter((a) => a.status === 'in_progress').length;
    const waiting = items.filter((a) => a.status === 'confirmed' || a.status === 'pending').length;
    const cancelled = items.filter((a) => a.status === 'cancelled' || a.status === 'no_show').length;
    return { total, done, inProg, waiting, cancelled };
  }, [items]);

  async function setStatus(a: Appointment, status: AppointmentStatus) {
    await updateAppointmentStatus(a.id, status);
    void refresh();
  }
  async function cancel(a: Appointment) {
    await cancelAppointment(a.id);
    void refresh();
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-hospital-600" /> الاستقبال — إدارة مواعيد اليوم
            </h2>
            <p className="text-xs text-slate-500 mt-1">{formatArDateLong(date)}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الهاتف أو رقم الدور..."
                className={`${inputCls} ps-9 w-64`}
              />
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputCls} w-40`}
            />
            <Button variant="outline" size="md" onClick={() => printAppointments(filtered, formatArDateLong(date))} disabled={loading || filtered.length === 0}>
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            <Button variant="outline" size="md" onClick={() => exportToExcel(filtered, date)} disabled={loading || filtered.length === 0}>
              <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
            </Button>
            <Button onClick={() => setBookOpen(true)}><UserPlus className="w-4 h-4" /> حجز يدوي</Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="إجمالي المواعيد" value={stats.total} icon={<ClipboardList className="w-4 h-4" />} tone="slate" />
        <StatCard label="بانتظار الكشف" value={stats.waiting} icon={<Clock className="w-4 h-4" />} tone="sky" />
        <StatCard label="داخل العيادة" value={stats.inProg} icon={<Play className="w-4 h-4" />} tone="amber" />
        <StatCard label="تم الكشف" value={stats.done} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
        <StatCard label="ملغي/غائب" value={stats.cancelled} icon={<XCircle className="w-4 h-4" />} tone="rose" />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <FilterChip active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} label="الكل" count={items.length} />
        {Object.entries(STATUS_META).map(([k, m]) => {
          const count = items.filter((a) => a.status === k).length;
          return (
            <FilterChip
              key={k}
              active={filterStatus === (k as AppointmentStatus)}
              onClick={() => setFilterStatus(k as AppointmentStatus)}
              label={m.label}
              count={count}
              tone={m.tone}
            />
          );
        })}
      </div>

      {/* List */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="w-7 h-7" />}
            title={items.length === 0 ? 'لا توجد مواعيد في هذا اليوم' : 'لا نتائج مطابقة'}
            subtitle={items.length === 0 ? 'استخدم زر «حجز يدوي» لإضافة موعد جديد.' : 'جرّب تغيير الفلاتر أو البحث.'}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((a) => (
              <ReceptionRow
                key={a.id}
                appt={a}
                onStatus={(s) => setStatus(a, s)}
                onCancel={() => cancel(a)}
              />
            ))}
          </div>
        )}
      </Card>

      {bookOpen && (
        <ManualBookingModal
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          onBooked={() => { setBookOpen(false); void refresh(); }}
        />
      )}
    </div>
  );
}

function ReceptionRow({
  appt, onStatus, onCancel,
}: {
  appt: Appointment;
  onStatus: (s: AppointmentStatus) => void;
  onCancel: () => void;
}) {
  const meta = STATUS_META[appt.status];
  const Icon = specialtyIcon(appt.specialty?.icon);
  const tone = toneOf(appt.specialty?.color);

  const next: Record<AppointmentStatus, AppointmentStatus | null> = {
    pending: 'confirmed',
    confirmed: 'in_progress',
    in_progress: 'completed',
    completed: null,
    cancelled: null,
    no_show: null,
  };
  const nextLabel: Record<AppointmentStatus, string | null> = {
    pending: 'تأكيد الحضور',
    confirmed: 'استدعاء للكشف',
    in_progress: 'إنهاء الكشف',
    completed: null,
    cancelled: null,
    no_show: null,
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/50 transition">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Turn number */}
        <div className="w-14 h-14 rounded-2xl bg-hospital-600 text-white flex flex-col items-center justify-center shrink-0 shadow-sm">
          <span className="text-[10px] opacity-80">دور</span>
          <span className="text-xl font-extrabold leading-none">{appt.turn_number}</span>
        </div>
        {/* Specialty icon */}
        <div className={`w-10 h-10 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-slate-800 truncate">{appt.patient?.name ?? '—'}</h4>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-1">
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5" /> {appt.doctor?.title} {appt.doctor?.name}
            </span>
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTime12h(appt.appointment_time)}</span>
            {appt.doctor?.room && <span>غرفة {appt.doctor.room}</span>}
            {appt.patient?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {appt.patient.phone}</span>}
          </div>
        </div>
      </div>
      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {next[appt.status] && nextLabel[appt.status] && (
          <Button size="sm" onClick={() => onStatus(next[appt.status]!)}>
            {nextLabel[appt.status]} <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </Button>
        )}
        {appt.status === 'confirmed' && (
          <Button size="sm" variant="outline" onClick={() => onStatus('no_show')}>لم يحضر</Button>
        )}
        {(appt.status === 'pending' || appt.status === 'confirmed') && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-rose-600 hover:bg-rose-50">
            <XCircle className="w-3.5 h-3.5" /> إلغاء
          </Button>
        )}
        {appt.status === 'completed' && (
          <Badge tone="emerald"><CheckCircle2 className="w-3.5 h-3.5" /> تم</Badge>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'slate' | 'sky' | 'amber' | 'emerald' | 'rose' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold text-slate-800 mt-2">{value}</p>
    </Card>
  );
}

function FilterChip({
  active, onClick, label, count, tone = 'slate',
}: {
  active: boolean; onClick: () => void; label: string; count: number;
  tone?: 'slate' | 'teal' | 'amber' | 'rose' | 'sky' | 'emerald' | 'violet';
}) {
  const activeTones: Record<string, string> = {
    slate: 'bg-slate-700 text-white',
    teal: 'bg-hospital-600 text-white',
    amber: 'bg-amber-500 text-white',
    rose: 'bg-rose-500 text-white',
    sky: 'bg-sky-500 text-white',
    emerald: 'bg-emerald-500 text-white',
    violet: 'bg-violet-500 text-white',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
        active ? `${activeTones[tone]} border-transparent shadow-sm` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
    </button>
  );
}

// ---- Manual booking modal ----
function ManualBookingModal({
  open, onClose, onBooked,
}: {
  open: boolean; onClose: () => void; onBooked: () => void;
}) {
  const { specialties } = useSpecialties();
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const { doctors } = useDoctors(specialty?.id);
  const [date, setDate] = useState<string>(todayValue());
  const [time, setTime] = useState('');
  const [patient, setPatient] = useState({ name: '', phone: '', national_id: '', gender: '', birth_year: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { items: booked } = useAppointments({ doctorId: doctor?.id, date });
  const slots = useMemo(
    () => doctor ? buildSlotsForDoctor(doctor, date, booked.map((a) => a.appointment_time)) : [],
    [doctor, date, booked],
  );

  async function submit() {
    setError(null);
    if (!doctor || !specialty) { setError('اختر التخصص والطبيب'); return; }
    if (!patient.name.trim()) { setError('أدخل اسم المريض'); return; }
    if (!time) { setError('اختر الموعد'); return; }
    setSubmitting(true);
    const p = await findOrCreatePatient({
      name: patient.name,
      phone: patient.phone || undefined,
      national_id: patient.national_id || undefined,
      gender: patient.gender || undefined,
      birth_year: patient.birth_year ? Number(patient.birth_year) : undefined,
    });
    if (!p) { setSubmitting(false); setError('تعذّر تسجيل المريض'); return; }
    const { error: err } = await createAppointment({
      patient_id: p.id,
      doctor_id: doctor.id,
      specialty_id: specialty.id,
      appointment_date: date,
      appointment_time: time,
      booked_via: 'reception',
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    // reset
    setSpecialty(null); setDoctor(null); setTime(''); setPatient({ name: '', phone: '', national_id: '', gender: '', birth_year: '' });
    onBooked();
  }

  return (
    <Modal open={open} onClose={onClose} title="حجز موعد يدوي" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Specialty */}
        <Field label="التخصص" required>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {specialties.map((s) => {
              const Icon = specialtyIcon(s.icon);
              const tone = toneOf(s.color);
              const active = specialty?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSpecialty(s); setDoctor(null); setTime(''); }}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm font-semibold transition ${
                    active ? `${tone.bg} ${tone.text} border-transparent ring-2 ring-offset-1 ${tone.ring}` : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" /> <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Doctor */}
        <Field label="الطبيب" required>
          <select
            value={doctor?.id ?? ''}
            onChange={(e) => { const d = doctors.find((x) => x.id === e.target.value) ?? null; setDoctor(d); setTime(''); }}
            className={inputCls}
          >
            <option value="">اختر الطبيب...</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.title} {d.name} {d.room ? `— غرفة ${d.room}` : ''}</option>
            ))}
          </select>
        </Field>

        {/* Date & time */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="اليوم" required>
            <input type="date" value={date} min={todayValue()} onChange={(e) => { setDate(e.target.value); setTime(''); }} className={inputCls} />
          </Field>
          <Field label="الوقت" required>
            {doctor && !doctor.available_days.includes(weekdayOf(date)) ? (
              <p className="text-xs text-rose-500 py-2.5">الطبيب غير متاح في هذا اليوم.</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-slate-400 py-2.5">لا توجد مواعيد متاحة.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                {slots.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTime(s)}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition ${
                      time === s ? 'bg-hospital-600 text-white border-hospital-600' : 'bg-white border-slate-200 hover:border-hospital-300'
                    }`}
                  >
                    {formatTime12h(s)}
                  </button>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-sm font-bold text-slate-700 mb-3">بيانات المريض</h4>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="الاسم" required>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} placeholder="الاسم الكامل" className={`${inputCls} ps-9`} />
              </div>
            </Field>
            <Field label="الهاتف">
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input value={patient.phone} onChange={(e) => setPatient({ ...patient, phone: e.target.value })} placeholder="05xxxxxxxx" className={`${inputCls} ps-9`} />
              </div>
            </Field>
            <Field label="رقم الهوية">
              <div className="relative">
                <IdCard className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input value={patient.national_id} onChange={(e) => setPatient({ ...patient, national_id: e.target.value })} className={`${inputCls} ps-9`} />
              </div>
            </Field>
            <Field label="الجنس">
              <select value={patient.gender} onChange={(e) => setPatient({ ...patient, gender: e.target.value })} className={inputCls}>
                <option value="">اختر...</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </Field>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? 'جاري الحجز...' : 'تأكيد الحجز'}</Button>
        </div>
      </div>
    </Modal>
  );
}
