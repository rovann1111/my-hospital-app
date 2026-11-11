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

function StatBig({ label, value, icon, tone }: { label: string;