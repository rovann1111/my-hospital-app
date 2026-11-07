import { useMemo, useState } from 'react';
import {
  CalendarDays, Clock, CheckCircle2, ChevronLeft, User, Phone,
  Stethoscope, CalendarOff, PartyPopper, Ticket,
} from 'lucide-react';
import { useSpecialties, useDoctors, useAppointments, createAppointment, findOrCreatePatient } from '@/hooks/useData';
import { specialtyIcon, toneOf } from '@/lib/icons';
import type { Specialty, Doctor, Appointment } from '@/lib/supabase';
import { Button, Card, Loading, EmptyState, Badge, inputCls } from '@/components/ui';
import {
  WEEKDAY_AR, WEEKDAY_AR_SHORT, buildSlotsForDoctor, formatTime12h, formatArDate,
  todayValue, weekdayOf, toDateInputValue, formatArDateLong,
} from '@/lib/utils';

type Step = 1 | 2 | 3 | 4 | 5;

export function PatientBooking() {
  const { specialties, loading: loadingSpec } = useSpecialties();

  const [step, setStep] = useState<Step>(1);
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState<string>(todayValue());
  const [time, setTime] = useState<string>('');
  const [patient, setPatient] = useState<{ name: string; phone: string; national_id: string; gender: string; birth_year: string }>({
    name: '', phone: '', national_id: '', gender: '', birth_year: '',
  });

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAppt, setConfirmedAppt] = useState<Appointment | null>(null);

  const { doctors, loading: loadingDoctors } = useDoctors(specialty?.id);
  const { items: bookedForDoctor } = useAppointments({ doctorId: doctor?.id, date });

  const bookedTimes = useMemo(() => bookedForDoctor.map((a) => a.appointment_time), [bookedForDoctor]);
  const slots = useMemo(
    () => (doctor ? buildSlotsForDoctor(doctor, date, bookedTimes) : []),
    [doctor, date, bookedTimes],
  );

  function pickSpecialty(s: Specialty) {
    setSpecialty(s);
    setDoctor(null);
    setTime('');
    setStep(2);
  }

  function pickDoctor(d: Doctor) {
    setDoctor(d);
    setTime('');
    setDate(todayValue());
    setStep(3);
  }

  function resetAll() {
    setConfirmedAppt(null);
    setSpecialty(null);
    setDoctor(null);
    setTime('');
    setStep(1);
    setPatient({ name: '', phone: '', national_id: '', gender: '', birth_year: '' });
  }

  async function submit() {
    setError(null);
    if (!doctor || !specialty) return;
    if (!patient.name.trim()) { setError('الرجاء إدخال اسم المريض'); setStep(4); return; }
    if (!patient.phone.trim() || patient.phone.trim().length < 4) { setError('الرجاء إدخال رقم هاتف صحيح'); setStep(4); return; }
    if (!time) { setError('الرجاء اختيار موعد'); setStep(3); return; }

    setConfirming(true);
    const patientRec = await findOrCreatePatient({
      name: patient.name,
      phone: patient.phone || undefined,
      national_id: patient.national_id || undefined,
      gender: patient.gender || undefined,
      birth_year: patient.birth_year ? Number(patient.birth_year) : undefined,
    });
    if (!patientRec) {
      setConfirming(false);
      setError('تعذّر تسجيل بيانات المريض. حاول مرة أخرى.');
      return;
    }
    const { appointment, error: err } = await createAppointment({
      patient_id: patientRec.id,
      doctor_id: doctor.id,
      specialty_id: specialty.id,
      appointment_date: date,
      appointment_time: time,
      booked_via: 'patient',
    });
    setConfirming(false);
    if (err || !appointment) {
      setError(err ?? 'تعذّر تأكيد الحجز. حاول مرة أخرى.');
      return;
    }
    setConfirmedAppt(appointment);
    setStep(5);
  }

  if (loadingSpec) return <Loading label="جاري تحميل التخصصات..." />;

  // ---------- Step 5: confirmation ----------
  if (step === 5 && confirmedAppt) {
    return <Confirmation appt={confirmedAppt} onNew={resetAll} />;
  }

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="bg-gradient-to-l from-hospital-700 to-hospital-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-hospital-500/20 blur-2xl" />
        <div className="absolute left-20 bottom-0 w-24 h-24 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block bg-hospital-500/30 text-hospital-100 text-xs px-3 py-1 rounded-full mb-3 font-semibold border border-hospital-400/20">
            الخدمات الإلكترونية السريعة
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">احجز موعدك بالعيادات الخارجية بسهولة</h2>
          <p className="text-hospital-100 text-sm sm:text-base leading-relaxed">
            قم باختيار التخصص والطبيب المناسب، واحصل على رقم دورك الفوري دون الحاجة للانتظار في الاستقبال.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper step={step} />

      {/* Step 1: specialty */}
      {step === 1 && (
        <Card className="p-6">
          <StepHeader n={1} title="اختر التخصص الطبي" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-5">
            {specialties.map((s) => {
              const Icon = specialtyIcon(s.icon);
              const tone = toneOf(s.color);
              return (
                <button
                  key={s.id}
                  onClick={() => pickSpecialty(s)}
                  className="group text-start rounded-2xl border border-slate-100 hover:border-hospital-300 bg-white hover:shadow-soft transition-all p-4 flex flex-col gap-3 active:scale-[0.98]"
                >
                  <div className={`w-12 h-12 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm leading-tight">{s.name}</h4>
                    {s.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{s.description}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Step 2: doctors */}
      {step === 2 && (
        <Card className="p-6">
          <StepHeader n={2} title={`اختر الطبيب — ${specialty?.name ?? ''}`} onBack={() => setStep(1)} />
          {loadingDoctors ? (
            <Loading label="جاري تحميل الأطباء..." />
          ) : doctors.length === 0 ? (
            <EmptyState icon={<Stethoscope className="w-7 h-7" />} title="لا يوجد أطباء متاحون في هذا التخصص حالياً" subtitle="جرّب تخصصاً آخر أو عُد لاحقاً." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              {doctors.map((d) => {
                const days = d.available_days.map((x) => WEEKDAY_AR_SHORT[x]).join(' · ');
                return (
                  <button
                    key={d.id}
                    onClick={() => pickDoctor(d)}
                    className="text-start rounded-2xl border border-slate-100 hover:border-hospital-300 bg-white hover:shadow-soft transition-all p-4 flex gap-4 items-start active:scale-[0.98]"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-hospital-100 text-hospital-700 flex items-center justify-center font-bold text-lg shrink-0">
                      {d.title === 'استشاري' ? 'است' : 'خص'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-800">{d.name}</h4>
                        <Badge tone="teal">{d.title}</Badge>
                      </div>
                      {d.bio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{d.bio}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                        <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {days}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTime12h(d.shift_start)} - {formatTime12h(d.shift_end)}</span>
                        {d.room && <span>غرفة: {d.room}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Step 3: date & time */}
      {step === 3 && doctor && (
        <Card className="p-6">
          <StepHeader n={3} title="اختر اليوم والوقت المناسب" onBack={() => setStep(2)} />
          <div className="grid md:grid-cols-2 gap-6 mt-5">
            {/* Date picker + next 7 days */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">اختر اليوم</label>
              <input
                type="date"
                value={date}
                min={todayValue()}
                onChange={(e) => { setDate(e.target.value); setTime(''); }}
                className={inputCls}
              />
              <div className="grid grid-cols-7 gap-1.5 mt-3">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  const v = toDateInputValue(d);
                  const wd = d.getDay();
                  const active = date === v;
                  const avail = doctor.available_days.includes(wd);
                  return (
                    <button
                      key={v}
                      onClick={() => { setDate(v); setTime(''); }}
                      disabled={!avail}
                      className={`aspect-square rounded-xl border text-xs flex flex-col items-center justify-center gap-0.5 transition ${
                        active ? 'bg-hospital-600 text-white border-hospital-600 shadow'
                        : avail ? 'bg-white text-slate-700 border-slate-200 hover:border-hospital-300'
                        : 'bg-slate-50 text-slate-300 border-slate-100 line-through cursor-not-allowed'
                      }`}
                    >
                      <span className="text-[10px]">{WEEKDAY_AR_SHORT[wd]}</span>
                      <span className="font-bold">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              {!doctor.available_days.includes(weekdayOf(date)) && (
                <p className="text-xs text-rose-500 mt-3 flex items-center gap-1.5">
                  <CalendarOff className="w-4 h-4" /> الطبيب غير متاح في {WEEKDAY_AR[weekdayOf(date)]}. اختر يوماً آخر.
                </p>
              )}
              <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                <span className="font-bold text-slate-700">{formatArDateLong(date)}</span>
              </div>
            </div>

            {/* Slots */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                الأوقات المتاحة {doctor && `(${formatTime12h(doctor.shift_start)} - ${formatTime12h(doctor.shift_end)})`}
              </label>
              {slots.length === 0 ? (
                <EmptyState
                  icon={<Clock className="w-7 h-7" />}
                  title="لا توجد مواعيد متاحة"
                  subtitle="كل المواعيد محجوزة أو الطبيب غير متاح في هذا اليوم."
                />
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pe-1">
                  {slots.map((s) => {
                    const active = time === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setTime(s)}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition active:scale-95 ${
                          active
                            ? 'bg-hospital-600 text-white border-hospital-600 shadow'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-hospital-300 hover:bg-hospital-50'
                        }`}
                      >
                        {formatTime12h(s)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 mt-4">{error}</p>}
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4" /> رجوع</Button>
            <Button onClick={() => { if (!time) { setError('الرجاء اختيار موعد'); return; } setError(null); setStep(4); }} disabled={!time}>
              التالي <ChevronLeft className="w-4 h-4 rotate-180" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: patient info + confirm */}
      {step === 4 && doctor && specialty && (
        <Card className="p-6">
          <StepHeader n={4} title="بيانات المريض وتأكيد الحجز" onBack={() => setStep(3)} />
          <div className="grid md:grid-cols-2 gap-5 mt-5">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">اسم المريض <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    value={patient.name}
                    onChange={(e) => setPatient({ ...patient, name: e.target.value })}
                    placeholder="الاسم الكامل"
                    className={`${inputCls} ps-9`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">رقم الهاتف <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    value={patient.phone}
                    onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
                    placeholder="05xxxxxxxx"
                    inputMode="tel"
                    className={`${inputCls} ps-9`}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">سيتم استخدام رقم الهاتف لاستعلامك عن موعدك لاحقاً.</p>
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-hospital-50/50 border border-hospital-100 rounded-2xl p-5">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-hospital-600" /> ملخص الحجز
              </h4>
              <div className="space-y-3 text-sm">
                <Row label="التخصص" value={specialty.name} />
                <Row label="الطبيب" value={`${doctor.title} ${doctor.name}`} />
                <Row label="اليوم" value={formatArDate(date)} />
                <Row label="الوقت" value={time ? formatTime12h(time) : '—'} />
                <Row label="الغرفة" value={doctor.room ?? '—'} />
                <div className="border-t border-hospital-100 pt-3 mt-3">
                  <Row label="رسوم الكشف" value={`${doctor.consultation_fee} ر.س`} strong />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 mt-4">{error}</p>}
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep(3)}><ChevronLeft className="w-4 h-4" /> رجوع</Button>
            <Button onClick={submit} disabled={confirming || !patient.name.trim() || !patient.phone.trim() || !time}>
              {confirming ? 'جاري التأكيد...' : <>تأكيد الحجز <CheckCircle2 className="w-4 h-4" /></>}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ['التخصص', 'الطبيب', 'الموعد', 'البيانات', 'التأكيد'];
  return (
    <div className="flex items-center gap-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-3 overflow-x-auto">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = step >= n;
        const current = step === n;
        return (
          <div key={l} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition ${
                active ? 'bg-hospital-600 text-white' : 'bg-slate-100 text-slate-400'
              } ${current ? 'ring-4 ring-hospital-100' : ''}`}
            >
              {active && step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
            </div>
            <span className={`text-xs font-semibold ${active ? 'text-hospital-700' : 'text-slate-400'} hidden sm:inline`}>{l}</span>
            {i < labels.length - 1 && <div className={`h-0.5 flex-1 ${active && step > n ? 'bg-hospital-500' : 'bg-slate-100'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function StepHeader({ n, title, onBack }: { n: number; title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <span className="w-8 h-8 bg-hospital-100 text-hospital-700 rounded-full flex items-center justify-center text-sm font-extrabold">{n}</span>
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`text-end ${strong ? 'font-bold text-hospital-700 text-base' : 'font-semibold text-slate-800'}`}>{value}</span>
    </div>
  );
}

function Confirmation({ appt, onNew }: { appt: Appointment; onNew: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-8 text-center overflow-hidden relative">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-hospital-100/40 blur-3xl" />
        <div className="relative z-10">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <PartyPopper className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 mb-1">تم تأكيد حجزك بنجاح!</h2>
          <p className="text-slate-500 text-sm mb-6">احتفظ برقم دورك وصل قبل الموعد بـ 15 دقيقة.</p>

          {/* Ticket */}
          <div className="bg-gradient-to-l from-hospital-700 to-hospital-900 text-white rounded-2xl p-6 text-start shadow-xl relative">
            <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-slate-50" />
            <div className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-slate-50" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-hospital-200">رقم الدور</p>
                <p className="text-4xl font-extrabold tracking-wider">{appt.turn_number}</p>
              </div>
              <Badge tone="amber" className="text-amber-900">مؤكد</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="المريض" value={appt.patient?.name ?? '—'} />
              <Info label="الطبيب" value={`${appt.doctor?.title ?? ''} ${appt.doctor?.name ?? ''}`} />
              <Info label="التاريخ" value={formatArDate(appt.appointment_date)} />
              <Info label="الوقت" value={formatTime12h(appt.appointment_time)} />
              <Info label="الغرفة" value={appt.doctor?.room ?? '—'} />
              <Info label="التخصص" value={appt.specialty?.name ?? '—'} />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onNew} variant="primary">حجز موعد آخر</Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
            >
              طباعة الإيصال
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 rounded-lg px-3 py-2">
      <p className="text-[10px] text-hospital-200">{label}</p>
      <p className="font-semibold text-white text-sm leading-tight">{value}</p>
    </div>
  );
}
