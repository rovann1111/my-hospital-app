import { useState } from 'react';
import { Lock, User, LogIn, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Modal, Button, inputCls } from '@/components/ui';

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setUsername('');
    setPassword('');
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="تسجيل دخول الموظفين" maxWidth="max-w-md">
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-14 h-14 rounded-2xl bg-hospital-100 text-hospital-700 flex items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <p className="text-sm text-slate-500">الدخول مخصص للموظفين والإدارة فقط. المرضى يمكنهم الحجز والاستعلام دون تسجيل.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">اسم المستخدم</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="shery"
                autoComplete="username"
                className={`${inputCls} ps-9`}
                disabled={busy}
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={`${inputCls} ps-9`}
                disabled={busy}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'جاري التحقق...' : <><LogIn className="w-4 h-4" /> تسجيل الدخول</>}
          </Button>
        </form>

// Small inline trigger button used in the header for staff access.
export function StaffLoginButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-hospital-100 border border-white/10 transition"
      title="تسجيل دخول الموظفين"
    >
      <Lock className="w-3.5 h-3.5" /> تسجيل دخول الموظفين
    </button>
  );
}

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white transition"
      title="تسجيل الخروج"
    >
      <X className="w-3.5 h-3.5" /> خروج
    </button>
  );
}
