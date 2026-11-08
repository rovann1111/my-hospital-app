import { useEffect, useState } from 'react';
import { Header, type Route, type PublicRoute, type StaffRoute } from '@/components/Header';
import { LoginModal } from '@/components/LoginModal';
import { PatientBooking } from '@/views/PatientBooking';
import { PatientLookup } from '@/views/PatientLookup';
import { Reception } from '@/views/Reception';
import { DoctorClinic } from '@/views/DoctorClinic';
import { Admin } from '@/views/Admin';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { Loading } from '@/components/ui';

const STAFF_ROUTES: StaffRoute[] = ['reception', 'doctor', 'admin'];

function isStaffRoute(r: string | null): r is StaffRoute {
  return !!r && (STAFF_ROUTES as string[]).includes(r);
}
function isPublicRoute(r: string | null): r is PublicRoute {
  return r === 'booking' || r === 'lookup';
}

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').trim();
  if (isStaffRoute(h)) return h;
  if (isPublicRoute(h)) return h;
  return 'booking';
}

function setHashRoute(r: Route) {
  const target = `#/${r}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

function AppInner() {
  const { user, loading } = useAuth();
  const [route, setRouteState] = useState<Route>(() => routeFromHash());
  const [loginOpen, setLoginOpen] = useState(false);

  // Dark / Light mode state with persistence online/local
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sal_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sal_dark_mode', String(darkMode));
    } catch {
      /* ignore */
    }
  }, [darkMode]);

  // Sync route <-> hash. When the hash changes (back/forward), update state.
  useEffect(() => {
    const onHash = () => setRouteState(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Route protection: if an unauthenticated user lands on a staff route,
  // redirect to the public booking page.
  useEffect(() => {
    if (loading) return;
    if (isStaffRoute(route) && !user) {
      setRouteState('booking');
      setHashRoute('booking');
    }
  }, [route, user, loading]);

  // Keep hash in sync when the route changes via in-app navigation.
  const setRoute = (r: Route) => {
    setRouteState(r);
    setHashRoute(r);
  };

  // After a successful login, if the user is still on a public route,
  // route them to the reception by default so they see staff content.
  useEffect(() => {
    if (user && isPublicRoute(route)) {
      setRoute('reception');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loading label="جاري التحقق من الجلسة..." />
      </div>
    );
  }

  // Effective route: staff routes require a logged-in user.
  const effectiveRoute: Route = isStaffRoute(route) && user ? route : isPublicRoute(route) ? route : 'booking';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${darkMode ? 'bg-slate-900 text-slate-100 dark' : 'bg-slate-50 text-slate-800'}`}>
      {/* شريط الأزرار العلوي للوضع الليلي والنهاري */}
      <div className={`w-full px-4 py-2 border-b flex items-center justify-end gap-2 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
        <span>تفضيل المظهر:</span>
        <button
          onClick={() => setDarkMode(false)}
          className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${!darkMode ? 'bg-white shadow text-emerald-700 font-bold' : 'hover:bg-slate-700'}`}
        >
          ☀️ نهارى
        </button>
        <button
          onClick={() => setDarkMode(true)}
          className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${darkMode ? 'bg-slate-700 shadow text-amber-300 font-bold' : 'hover:bg-slate-200'}`}
        >
          🌙 ليلى
        </button>
      </div>

      <Header route={effectiveRoute} setRoute={setRoute} onStaffLogin={() => setLoginOpen(true)} />
      
      <main className={`flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 ${darkMode ? 'text-slate-100' : ''}`}>
        {effectiveRoute === 'booking' && <PatientBooking />}
        {effectiveRoute === 'lookup' && <PatientLookup />}
        {effectiveRoute === 'reception' && user && <Reception />}
        {effectiveRoute === 'doctor' && user && <DoctorClinic />}
        {effectiveRoute === 'admin' && user && <Admin />}
      </main>

      <footer className={`border-t ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-100 text-slate-400'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs">
          مستشفى السلام التخصصي — نظام حجز وإدارة العيادات الخارجية © 2026 Dev Shrehan M
        </div>
      </footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

export default App;