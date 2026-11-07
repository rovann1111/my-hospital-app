import { useEffect, useMemo, useState } from 'react';
import {
  Stethoscope, Clock, Play, CheckCircle2, XCircle, UserX, ArrowLeft, ArrowRight,
  Megaphone, CalendarDays, ClipboardList, Phone, Search, Filter,
} from 'lucide-react';
import { useDoctors, useAppointments, updateAppointmentStatus, useSpecialties } from '@/hooks/useData';
import type { Appointment, AppointmentStatus, Doctor } from '@/lib/supabase';
import { Button, Card, Loading, EmptyState, Badge, inputCls } from '@/components/ui';
import { specialtyIcon, toneOf } from '@/lib/icons';
import { WEEKDAY_AR, formatTime12h, todayValue, formatArDateLong, weekdayOf } from '@/lib/utils';

const STATUS_META: Record<AppointmentStatus, { label: string; tone: 'slate' | 'teal' | 'amber' | 'rose' | 'sky' | 'emerald' | 'violet' }> = {
  pending:     { label: 'في الانتظار', tone: 'slate' },
  confirmed:   { label: 'مؤكد',       tone: 'sky' },
  in_progress: { label: 'في الكشف',   tone: 'amber' },
  completed:   { label: 'مكتمل',      tone: 'emerald' },
  cancelled:   { label: 'ملغي',       tone: 'rose' },
  no_show:     { label: 'لم يحضر',    tone: 'violet' },
};

type SortKey = 'turn' | 'time' | 'name';

export function DoctorClinic() {
  const { doctors } = useDoctors();
  const { specialties } = useSpecialties();
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<string>(todayValue());
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('turn');

  // pick first active doctor by default
  useEffect(() => {
    if (!doctorId && doctors.length > 0) {
      const firstActive = doctors.find((d) => d.status === 'active') ?? doctors[0];
      setDoctorId(firstActive.id);
    }
  }, [doctors, doctorId]);

  const doctor = useMemo(() => doctors.find((d) => d.id === doctorId) ?? null, [doctors, doctorId]);
  const specialty = useMemo(() => specialties.find((s) => s.id === doctor?.specialty_id) ?? null, [specialties, doctor]);
  const { items, loading, refresh } = useAppointments({ doctorId, date });

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((a) => a.status === 'completed').length;
    const inProg = items.filter((a) => a.status === 'in_progress').length;
    const waiting = items.filter((a) => a.status === 'confirmed' || a.status === 'pending').length;
    const cancelled = items.filter((a) => a.status === 'cancelled' || a.status === 'no_show').length;
    const remaining = items.filter((a) => a.status === 'confirmed' || a.status === 'pending').length;
    return { total, done, inProg, waiting, cancelled, remaining };
  }, [items]);

  // Search + sort helpers
  const matchesSearch = (a: Appointment) => {
    if (!search.trim()) return true;
    const q = search.trim();
    return (
      a.patient?.name?.includes(q) ||
      a.patient?.phone?.includes(q) ||
      a.patient?.national_id?.includes(q) ||
      String(a.turn_number).includes(q)
    );
  };

  const sortItems = (arr: Appointment[]) => {
    const sorted = [...arr];
    if (sortKey === 'name') sorted.sort((a, b) => (a.patient?.name ?? '').localeCompare(b.patient?.name ?? ''));
    else if (sortKey === 'time') sorted.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    else sorted.sort((a, b) => a.turn_number - b.turn_number);
    return sorted;
  };

  const isFiltering = filterStatus !== 'all' || search.trim() !== '';

  // current patient = in_progress; next = first confirmed/pending by turn_number
  const sorted = useMemo(() => [...items].sort((a, b) => a.turn_number - b.turn_number), [items]);
  const current = sorted.find((a) => a.status === 'in_progress') ?? null;
  const nextPatients = sorted.filter((a) => a.status === 'confirmed' || a.status === 'pending');
  const next = nextPatients[0] ?? null;
  const upcoming = sortItems(nextPatients.slice(1).filter(matchesSearch));
  const done = sortItems(sorted.filter((a) => a.status === 'completed').filter(matchesSearch));

  // Full filtered list (used when a status filter is active)
  const filteredAll = useMemo(() => {
    let list = items.filter(matchesSearch);
    if (filterStatus !== 'all') list = list.filter((a) => a.status === filterStatus);
    return sortItems(list);
  }, [items, filterStatus, search, sortKey]);

  async function setStatus(a: Appointment, s: AppointmentStatus) {
    await updateAppointmentStatus(a.id, s, 'doctor');
    void refresh();
  }

  async function callNext() {
    // complete the current in_progress if any, then start the next
    if (current) await updateAppointmentStatus(current.id, 'completed', 'doctor');
    if (next) await updateAppointmentStatus(next.id, 'in_progress', 'doctor');
    void refresh();
  }

  if (doctors.length === 0) {
    return <Card className="p-6"><EmptyState icon={<Stethoscope className="w-7 h-7" />} title="لا يوجد أطباء مسجّلون" subtitle="أضف أطباء من قسم الإدارة." /></Card>;
  }

  return (
    <div className="space-y-6">
      {/* Doctor selector + date */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-hospital-600" /> عيادة الطبيب
            </h2>
            <p className="text-xs text-slate-500 mt-1">{formatArDateLong(date)}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={`${inputCls} w-56`}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.title} {d.name}{d.status === 'inactive' ? ' (غير نشط)' : ''}</option>
              ))}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-40`} />
          </div>
        </div>
      </Card>

      {doctor && (
        <DoctorBanner doctor={doctor} specialtyName={specialty?.name ?? null} specialtyColor={specialty?.color ?? null} icon={specialty?.icon ?? null} weekday={weekdayOf(date)} available={doctor.available_days.includes(weekdayOf(date))} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="إجمالي اليوم" value={stats.total} icon={<CalendarDays className="w-4 h-4" />} tone="slate" />
        <Stat label="بانتظار" value={stats.waiting} icon={<Clock className="w-4 h-4" />} tone="sky" />
        <Stat label="داخل العيادة" value={stats.inProg} icon={<Play className="w-4 h-4" />} tone="amber" />
        <Stat label="تم الكشف" value={stats.done} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
        <Stat label="ملغي/غائب" value={stats.cancelled} icon={<UserX className="w-4 h-4" />} tone="rose" />
      </div>

      {/* Filter / search / sort bar */}
      {!loading && items.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex flex-wrap gap-1.5 items-center">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <FilterChip active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} label="الكل" count={items.length} />
              {Object.entries(STATUS_META).map(([k, m]) => {
                const count = items.filter((a) => a.status === k).length;
                if (count === 0) return null;
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
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف أو رقم الدور..."
                  className={`${inputCls} ps-9 w-52`}
                />
              </div>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={`${inputCls} w-36`}
              >
                <option value="turn">ترتيب: رقم الدور</option>
                <option value="time">ترتيب: الوقت</option>
                <option value="name">ترتيب: الاسم</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={<ClipboardList className="w-7 h-7" />} title="لا توجد مواعيد لهذا الطبيب اليوم" subtitle="اختر تاريخاً آخر أو انتظر تسجيل الحجوزات." />
        </Card>
      ) : isFiltering ? (
        <Card className="p-0 overflow-hidden">
          {filteredAll.length === 0 ? (
            <EmptyState icon={<Search className="w-7 h-7" />} title="لا نتائج مطابقة" subtitle="جرّب تغيير الفلاتر أو البحث." />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAll.map((a) => (
                <FilteredRow key={a.id} appt={a} onStatus={(s) => setStatus(a, s)} />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Current patient - big card */}
          <div className="lg:col-span-2 space-y-4">
            <CurrentCard current={current} next={next} onCallNext={callNext} onDone={current ? () => setStatus(current, 'completed') : undefined} onNoShow={next ? () => setStatus(next, 'no_show') : undefined} hasCurrent={!!current} hasNext={!!next} />
            {/* Upcoming list */}
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-hospital-600" /> قائمة الانتظار القادمة</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">لا يوجد مرضى آخرون في الانتظار.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcoming.map((a) => (
                    <UpcomingRow key={a.id} appt={a} onCall={() => setStatus(a, 'in_progress')} onNoShow={() => setStatus(a, 'no_show')} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Done list */}
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> المكتملة ({done.length})</h3>
            {done.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">لا توجد مواعيد مكتملة بعد.</p>
            ) : (
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pe-1">
                {done.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">{a.turn_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm truncate">{a.patient?.name}</p>
                      <p className="text-xs text-slate-400">{formatTime12h(a.appointment_time)}</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function DoctorBanner({
  doctor, specialtyName, specialtyColor, icon, weekday, available,
}: {
  doctor: Doctor; specialtyName: string | null; specialtyColor: string | null; icon: string | null; weekday: number; available: boolean;
}) {
  const BannerIcon = specialtyIcon(icon);
  const tone = toneOf(specialtyColor);
  const days = doctor.available_days.map((d) => WEEKDAY_AR[d]).join(' · ');
  return (
    <Card className={`p-5 overflow-hidden relative ${available ? '' : 'opacity-90'}`}>
      <div className={`absolute -left-10 -bottom-10 w-40 h-40 rounded-full ${tone.bg} opacity-40 blur-2xl`} />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl ${tone.bg} ${tone.text} flex items-center justify-center`}>
            <BannerIcon className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">{doctor.title} {doctor.name}</h3>
            <p className="text-sm text-slate-500">{specialtyName} · غرفة {doctor.room ?? '—'} · رسوم {doctor.consultation_fee} ر.س</p>
            <p className="text-xs text-slate-400 mt-0.5">{days} · {formatTime12h(doctor.shift_start)} - {formatTime12h(doctor.shift_end)}</p>
          </div>
        </div>
        <div>
          {available ? (
            <Badge tone="emerald"><CheckCircle2 className="w-3.5 h-3.5" /> متاح اليوم ({WEEKDAY_AR[weekday]})</Badge>
          ) : (
            <Badge tone="rose"><XCircle className="w-3.5 h-3.5" /> غير متاح ({WEEKDAY_AR[weekday]})</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

function CurrentCard({
  current, next, onCallNext, onDone, onNoShow, hasCurrent, hasNext,
}: {
  current: Appointment | null; next: Appointment | null; onCallNext: () => void; onDone?: () => void; onNoShow?: () => void; hasCurrent: boolean; hasNext: boolean;
}) {
  const Icon = specialtyIcon(current?.specialty?.icon);

  if (!hasCurrent && !hasNext) {
    return (
      <Card className="p-8">
        <EmptyState icon={<Megaphone className="w-7 h-7" />} title="انتهت قائمة المرضى" subtitle="لا يوجد مرضى في الانتظار حالياً." />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Play className="w-4 h-4 text-amber-500" /> المريض الحالي</h3>

      {hasCurrent && current ? (
        <div className="rounded-2xl bg-gradient-to-l from-amber-50 to-amber-100/50 border border-amber-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-900 flex flex-col items-center justify-center shrink-0 shadow">
              <span className="text-[10px]">دور</span>
              <span className="text-2xl font-extrabold leading-none">{current.turn_number}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-bold text-slate-800">{current.patient?.name}</h4>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-1">
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTime12h(current.appointment_time)}</span>
                {current.patient?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {current.patient.phone}</span>}
                {current.patient?.gender && <span>{current.patient.gender === 'male' ? 'ذكر' : 'أنثى'}</span>}
                {current.patient?.birth_year && <span>مواليد {current.patient.birth_year}</span>}
              </div>
              <Badge tone="amber" className="mt-2"><Play className="w-3 h-3" /> في الكشف</Badge>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={onDone} variant="primary"><CheckCircle2 className="w-4 h-4" /> إنهاء الكشف واستدعاء التالي</Button>
            <Button onClick={onNoShow} variant="outline"><UserX className="w-4 h-4" /> التالي لم يحضر</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-hospital-100 text-hospital-700 flex items-center justify-center">
            <Icon className="w-7 h-7" />
          </div>
          <div className="flex-1 text-center sm:text-start">
            <p className="text-slate-500 text-sm">لا يوجد مريض في الكشف حالياً.</p>
            {next && (
              <p className="font-bold text-slate-800 mt-1">المريض التالي: {next.patient?.name} — دور رقم {next.turn_number} — {formatTime12h(next.appointment_time)}</p>
            )}
          </div>
          {hasNext && next && (
            <Button onClick={onCallNext} variant="amber"><Megaphone className="w-4 h-4" /> استدعاء المريض التالي</Button>
          )}
        </div>
      )}

      {/* Next preview */}
      {hasCurrent && next && (
        <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <ArrowLeft className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500">التالي:</span>
          <span className="text-sm font-bold text-slate-800">{next.patient?.name}</span>
          <Badge tone="slate">دور {next.turn_number}</Badge>
          <span className="text-xs text-slate-400">{formatTime12h(next.appointment_time)}</span>
        </div>
      )}
    </Card>
  );
}

function UpcomingRow({ appt, onCall, onNoShow }: { appt: Appointment; onCall: () => void; onNoShow: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-9 h-9 rounded-xl bg-hospital-100 text-hospital-700 flex items-center justify-center text-sm font-bold shrink-0">{appt.turn_number}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{appt.patient?.name}</p>
        <p className="text-xs text-slate-400">{formatTime12h(appt.appointment_time)} {appt.patient?.phone ? `· ${appt.patient.phone}` : ''}</p>
      </div>
      <Button size="sm" onClick={onCall}><ArrowRight className="w-3.5 h-3.5 rotate-180" /> استدعاء</Button>
      <button onClick={onNoShow} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg p-1.5 transition" title="لم يحضر">
        <UserX className="w-4 h-4" />
      </button>
    </div>
  );
}

function FilteredRow({ appt, onStatus }: { appt: Appointment; onStatus: (s: AppointmentStatus) => void }) {
  const meta = STATUS_META[appt.status];
  const next: Record<AppointmentStatus, AppointmentStatus | null> = {
    pending: 'confirmed',
    confirmed: 'in_progress',
    in_progress: 'completed',
    completed: null,
    cancelled: null,
    no_show: null,
  };
  const nextLabel: Record<AppointmentStatus, string | null> = {
    pending: 'تأكيد',
    confirmed: 'استدعاء',
    in_progress: 'إنهاء الكشف',
    completed: null,
    cancelled: null,
    no_show: null,
  };
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/50 transition">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-hospital-600 text-white flex flex-col items-center justify-center shrink-0 shadow-sm">
          <span className="text-[9px] opacity-80">دور</span>
          <span className="text-lg font-extrabold leading-none">{appt.turn_number}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-slate-800 truncate">{appt.patient?.name ?? '—'}</h4>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-1">
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTime12h(appt.appointment_time)}</span>
            {appt.patient?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {appt.patient.phone}</span>}
            {appt.patient?.gender && <span>{appt.patient.gender === 'male' ? 'ذكر' : 'أنثى'}</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {next[appt.status] && nextLabel[appt.status] && (
          <Button size="sm" onClick={() => onStatus(next[appt.status]!)}>
            {nextLabel[appt.status]} <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </Button>
        )}
        {(appt.status === 'pending' || appt.status === 'confirmed') && (
          <button onClick={() => onStatus('no_show')} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg p-2 transition" title="لم يحضر">
            <UserX className="w-4 h-4" />
          </button>
        )}
        {appt.status === 'completed' && <Badge tone="emerald"><CheckCircle2 className="w-3.5 h-3.5" /> تم</Badge>}
      </div>
    </div>
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
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition ${
        active ? `${activeTones[tone]} border-transparent shadow-sm` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
    </button>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'slate' | 'sky' | 'amber' | 'emerald' | 'rose' }) {
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
