import { Building2, CalendarPlus, Search, ClipboardList, Stethoscope, ShieldCheck, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { StaffLoginButton, LogoutButton } from '@/components/LoginModal';
import type { StaffUser } from '@/lib/supabase';

export type PublicRoute = 'booking' | 'lookup';
export type StaffRoute = 'reception' | 'doctor' | 'admin';
export type Route = PublicRoute | StaffRoute;

const PUBLIC_TABS: { id: PublicRoute; label: string; short: string; icon: typeof CalendarPlus }[] = [
  { id: 'booking', label: 'حجز موعد', short: 'حجز', icon: CalendarPlus },
  { id: 'lookup',  label: 'استعلام عن حجز', short: 'استعلام', icon: Search },
];

const STAFF_TABS: { id: StaffRoute; label: string; short: string; icon: typeof ClipboardList }[] = [
  { id: 'reception', label: 'الاستقبال', short: 'استقبال', icon: ClipboardList },
  { id: 'doctor',    label: 'عيادة الطبيب', short: 'طبيب', icon: Stethoscope },
  { id: 'admin',     label: 'لوحة الإدارة', short: 'الإدارة', icon: ShieldCheck },
];

const ROLE_LABEL: Record<StaffUser['role'], string> = {
  admin: 'مدير',
  receptionist: 'استقبال',
  doctor: 'طبيب',
};

export function Header({
  route,
  setRoute,
  onStaffLogin,
}: {
  route: Route;
  setRoute: (r: Route) => void;
  onStaffLogin: () => void;
}) {
  const { user, logout } = useAuth();
  const isStaff = !!user;

  // Staff can see staff tabs; the public always sees the two public tabs.
  const visibleStaffTabs = isStaff ? STAFF_TABS : [];

  return (
    <>
      <header className="bg-hospital-800 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Logo & title */}
            <button
              onClick={() => setRoute('booking')}
              className="flex items-center gap-3 text-start"
              title="العودة للصفحة الرئيسية"
            >
              <div className="bg-white p-2 rounded-xl shadow-md text-hospital-800">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wide">مستشفى السلام التخصصي</h1>
                <p className="text-xs text-hospital-200">نظام حجز وإدارة العيادات الخارجية</p>
              </div>
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-1 bg-hospital-900/50 p-1 rounded-xl">
              {PUBLIC_TABS.map((t) => {
                const active = route === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setRoute(t.id)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition',
                      active ? 'bg-hospital-600 text-white shadow' : 'text-hospital-100 hover:bg-hospital-700/50',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}

              {/* Staff tabs divider + protected tabs */}
              {visibleStaffTabs.length > 0 && (
                <>
                  <span className="w-px bg-white/15 my-1 mx-1" aria-hidden />
                  {visibleStaffTabs.map((t) => {
                    const active = route === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setRoute(t.id)}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition',
                          active ? 'bg-hospital-600 text-white shadow' : 'text-hospital-100 hover:bg-hospital-700/50',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {t.label}
                      </button>
                    );
                  })}
                </>
              )}
            </nav>

            {/* Right side: login or user badge */}
            <div className="flex items-center gap-2">
              {isStaff && user ? (
                <>
                  <span className="hidden sm:inline-flex bg-amber-400 text-slate-900 text-xs px-3 py-1.5 rounded-full font-bold items-center gap-1 shadow-sm">
                    <Crown className="w-3.5 h-3.5" /> {user.display_name ?? user.username} ({ROLE_LABEL[user.role]})
                  </span>
                  <LogoutButton onClick={() => void logout()} />
                </>
              ) : (
                <StaffLoginButton onClick={onStaffLogin} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden bg-hospital-900 text-white px-2 py-2 flex justify-around border-b border-hospital-700 text-xs">
        {PUBLIC_TABS.map((t) => {
          const Icon = t.icon;
          const active = route === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setRoute(t.id)}
              className={cn(
                'flex flex-col items-center py-1 px-2 rounded-lg transition',
                active ? 'bg-hospital-600 text-white' : 'text-hospital-100',
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              {t.short}
            </button>
          );
        })}
        {visibleStaffTabs.map((t) => {
          const Icon = t.icon;
          const active = route === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setRoute(t.id)}
              className={cn(
                'flex flex-col items-center py-1 px-2 rounded-lg transition',
                active ? 'bg-hospital-600 text-white' : 'text-hospital-100',
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              {t.short}
            </button>
          );
        })}
      </div>
    </>
  );
}
