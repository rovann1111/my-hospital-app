import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StaffUser } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';

type LoginResult =
  | { success: true; user: StaffUser }
  | { success: false; error: string };

type AuthContextValue = {
  user: StaffUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'sal_staff_session';

function loadSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSession(username: string): void {
  try {
    localStorage.setItem(SESSION_KEY, username);
  } catch {
    /* ignore */
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// Default fallback super-admin user so shery/shery123 always works instantly
const DEFAULT_SUPER_ADMIN: StaffUser = {
  id: 'super-admin-shery',
  username: 'shery',
  password: 'shery123',
  display_name: 'shery (مدير النظام)',
  role: 'admin',
  is_super_admin: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const staffStorage = {
  async list(): Promise<StaffUser[]> {
    const { data, error } = await supabase.from('staff_users').select('*').order('created_at', { ascending: true });
    const cloudUsers = (error || !data) ? [] : (data as StaffUser[]);
    
    // Ensure default shery is always visible in management list
    if (!cloudUsers.some((u) => u.username.toLowerCase() === 'shery')) {
      return [DEFAULT_SUPER_ADMIN, ...cloudUsers];
    }
    return cloudUsers;
  },

  async add(input: {
    username: string;
    password: string;
    display_name: string;
    role: StaffUser['role'];
  }): Promise<{ user: StaffUser | null; error: string | null }> {
    const username = input.username.trim();
    if (username.length < 3) return { user: null, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' };
    if (input.password.length < 6) return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    if (username.toLowerCase() === 'shery') return { user: null, error: 'اسم المستخدم هذا محجوز' };

    const { data, error } = await supabase.from('staff_users').insert([{
      username,
      password: input.password,
      display_name: input.display_name,
      role: input.role,
      is_super_admin: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    }]).select().single();

    if (error || !data) return { user: null, error: error?.message || 'فشل إضافة المستخدم' };
    return { user: data as StaffUser, error: null };
  },

  async update(input: {
    id: string;
    display_name: string;
    role: StaffUser['role'];
    is_active: boolean;
    password: string;
  }): Promise<{ user: StaffUser | null; error: string | null }> {
    if (input.id === 'super-admin-shery') {
      return { user: DEFAULT_SUPER_ADMIN, error: null };
    }

    const updateFields: any = {
      display_name: input.display_name,
      role: input.role,
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    };
    if (input.password) updateFields.password = input.password;

    const { data, error } = await supabase.from('staff_users').update(updateFields).eq('id', input.id).select().single();
    if (error || !data) return { user: null, error: error?.message || 'فشل التعديل' };
    return { user: data as StaffUser, error: null };
  },

  async remove(id: string): Promise<{ error: string | null }> {
    if (id === 'super-admin-shery') return { error: 'لا يمكن حذف حساب المدير الأساسي' };
    const { error } = await supabase.from('staff_users').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initSession() {
      const username = loadSession();
      if (username) {
        if (username.toLowerCase() === 'shery') {
          setUser(DEFAULT_SUPER_ADMIN);
        } else {
          const { data } = await supabase.from('staff_users').select('*').eq('username', username).single();
          if (data && data.is_active) {
            setUser(data as StaffUser);
          } else {
            clearSession();
          }
        }
      }
      setLoading(false);
    }
    void initSession();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const cleanUser = username.trim().toLowerCase();

    // Instant bypass for default shery account
    if (cleanUser === 'shery' && password === 'shery123') {
      saveSession('shery');
      setUser(DEFAULT_SUPER_ADMIN);
      return { success: true, user: DEFAULT_SUPER_ADMIN };
    }

    const { data, error } = await supabase.from('staff_users').select('*').eq('username', cleanUser).single();
    
    if (error || !data || data.password !== password) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
    if (!data.is_active) {
      return { success: false, error: 'هذا الحساب معطّل. تواصل مع المدير' };
    }

    saveSession(data.username);
    setUser(data as StaffUser);
    return { success: true, user: data as StaffUser };
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}