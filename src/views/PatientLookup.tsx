import { useState } from 'react';
import { Search, Phone, CalendarDays, Clock, Stethoscope, Ticket, Loader2, Inbox, Building2 } from 'lucide-react';
import { lookupAppointmentsByPhone } from '@/hooks/useData';
import type { Appointment } from '@/lib/supabase';
import { specialtyIcon, toneOf } from '@/lib/icons';
import { Card, Button, Badge, EmptyState, inputCls } from '@/components/ui';
import { formatArDate, formatTime12h } from '@/lib/utils';

const STATUS_LABEL: Record<string, { label: string; tone: 'slate' | 'sky' | 'amber' | 'emerald' | 'rose' | 'violet' }> = {
  pending: { label: 'في الانتظار', tone: 'slate' },
  confirmed: { label: 'مؤكد', tone: 'sky' },
  in_progress: { label: 'داخل العيادة', tone: 'amber' },
  completed: { label: 'مكتمل', tone: 'emerald' },
  cancelled: { label: 'ملغي', tone: 'rose' },
  no_show: { label: 'لم يحضر', tone: 'violet' },
};

export function PatientLookup() {
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = phone.trim();
    if (q.length < 4) {
      setError('الرجاء إدخال رقم هاتف صحيح (٤ أرقام على الأقل)');
      return;
    }
    setLoading(true);
    setSearched(true);
    const { appointments, error: err } = await lookupAppointmentsByPhone(q);
    setLoading(false);
    if (err) {
      setError(err);
      setResults(null);
      return;
    }
    setResults(appointments);
  }

  return (
    <div className="space-y-6">
      {/* Hero / intro */}
      <div className="bg-gradient-to-l from-hospital-700 to-hospital-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-hospital-500/20 blur-2xl" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block bg-hospital-500/30 text-hospital-100 text-xs px-3 py-1 rounded-full mb-3 font-semibold border border-hospital-400/20">
            استعلام عن حجز
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">استعلم عن موعدك ورقم دورك</h2>
          <p className="text-hospital-100 text-sm sm:text-base leading-relaxed">
            أدخل رقم هاتفك المسجّل عند الحجز لعرض جميع المواعيد النشطة مع رقم الدور والتاريخ والطبيب.
          </p>
        </div>
      </div>

      {/* Search form */}
      <Card className="p-6">
        <form onSubmit={search} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">رقم الهاتف</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                inputMode="tel"
                className={`${inputCls} ps-9`}
                disabled={loading}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} size="lg">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري البحث...</> : <><Search className="w-4 h-4" /> بحث</>}
          </Button>
        </form>
        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      </Card>

      {/* Results */}
      {searched && !loading && !error && (
        <div className="space-y-3">
          {results && results.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">المواعيد النشطة ({results.length})</h3>
                <Badge tone="sky">للرقم: {phone}</Badge>
              </div>
              {results.map((a) => <BookingCard key={a.id} appt={a} />)}
            </>
          ) : (
            <Card className="p-6">
              <EmptyState
                icon={<Inbox className="w-7 h-7" />}
                title="لا توجد مواعيد نشطة لهذا الرقم"
                subtitle="تأكد من رقم الهاتف المسجّل عند الحجز، أو قم بحجز موعد جديد."
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function BookingCard({ appt }: { appt: Appointment }) {
  const spec = appt.specialty;
  const Icon = specialtyIcon(spec?.icon);
  const tone = toneOf(spec?.color);
  const status = STATUS_LABEL[appt.status] ?? STATUS_LABEL.pending;

  return (
    <Card className="p-5 overflow-hidden relative">
      <div className={`absolute -left-8 -bottom-8 w-32 h-32 rounded-full ${tone.bg} opacity-30 blur-2xl`} />
      <div className="relative z-10 flex flex-col sm:flex-row gap-4 sm:items-center">
        {/* Turn number ticket */}
        <div className="bg-gradient-to-br from-hospital-600 to-hospital-800 text-white rounded-2xl p-4 flex flex-col items-center justify-center shrink-0 shadow-md w-24">
          <span className="text-[10px] opacity-80">رقم الكشف</span>
          <span className="text-3xl font-extrabold leading-none my-1">{appt.turn_number}</span>
          <Ticket className="w-4 h-4 opacity-70" />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className={`w-8 h-8 rounded-lg ${tone.bg} ${tone.text} flex items-center justify-center`}>
              <Icon className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800">{spec?.name ?? 'تخصص'}</h4>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-slate-400" />
              <span><span className="text-slate-400">الطبيب:</span> <span className="font-semibold text-slate-700">{appt.doctor?.title} {appt.doctor?.name}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span><span className="text-slate-400">العيادة:</span> <span className="font-semibold text-slate-700">{appt.doctor?.room ?? '—'}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span><span className="text-slate-400">التاريخ:</span> <span className="font-semibold text-slate-700">{formatArDate(appt.appointment_date)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span><span className="text-slate-400">الوقت:</span> <span className="font-semibold text-slate-700">{formatTime12h(appt.appointment_time)}</span></span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
