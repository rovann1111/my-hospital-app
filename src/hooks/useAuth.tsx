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

// الحسابات الأساسية المضمونة مباشرة داخل الكود لضمان الدخول الفوري
const DEFAULT_STAFF_USERS: StaffUser[] = [
  {
    id: 'staff-shery',
    username: 'shery',
    password: 'shery135156',
    role: 'admin',
    created_at: new Date().toISOString(),
  },
  {
    id: 'staff-dr',
    username: 'dr',
    password: 'elsalam',
    role: 'receptionist',
    created_at: new Date().toISOString(),
  },
  {
    id: 'staff-drmarwa',
    username: 'DRmarwa',
    password: 'marwa',
    role: 'admin',
    created_at: new Date().toISOString(),
  },
];

function stripPassword(u: StaffUser & { password?: string }): StaffUser {
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

export const staffStorage = {
  async list(): Promise<StaffUser[]> {
    try {
      const { data, error } = await supabase.from('staff_users').select('*');
      if (error || !data || data.length === 0) {
        return DEFAULT_STAFF_USERS.map(stripPassword);
      }
      return data.map(stripPassword);
    } catch {
      return DEFAULT_STAFF_USERS.map(stripPassword);
    }
  },

  async add(input: {
    username: string;
    password: string;
    role: StaffUser['role'];
  }): Promise<{ user: StaffUser | null; error: string | null }> {
    const username = input.username.trim();
    if (username.length < 3) return { user: null, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' };
    if (input.password.length < 6) return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };

    const newStaff = {
      username,
      password: input.password,
      role: input.role,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase.from('staff_users').insert([newStaff]).select().single();
      if (error || !data) {
        return { user: null, error: 'فشل إضافة المستخدم في قاعدة البيانات' };
      }
      return { user: stripPassword(data), error: null };
    } catch {
      return { user: null, error: 'خطأ في الاتصال بقاعدة البيانات' };
    }
  },

  async update(input: {
    id: string | number;
    role: StaffUser['role'];
    password: string;
  }): Promise<{ user: StaffUser | null; error: string | null }> {
    if (input.password && input.password.length < 6) {
      return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    }

    const updateData: Record<string, any> = {
      role: input.role,
    };

    if (input.password) {
      updateData.password = input.password;
    }

    try {
      const { data, error } = await supabase
        .from('staff_users')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error || !data) {
        return { user: null, error: 'فشل تحديث البيانات' };
      }
      return { user: stripPassword(data), error: null };
    } catch {
      return { user: null, error: 'خطأ في الاتصال' };
    }
  },

  async remove(id: string | number): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.from('staff_users').delete().eq('id', id);
      if (error) return { error: 'فشل حذف المستخدم' };
      return { error: null };
    } catch {
      return { error: 'خطأ في الاتصال' };
    }
  },
};

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initSession() {
      const sessionUser = loadSession();
      if (sessionUser) {
        const foundLocal = DEFAULT_STAFF_USERS.find(
          (u) => u.username.toLowerCase() === sessionUser.toLowerCase()
        );
        if (foundLocal) {
          setUser(stripPassword(foundLocal));
        } else {
          try {
            const { data: found } = await supabase
              .from('staff_users')
              .select('*')
              .ilike('username', sessionUser)
              .maybeSingle();

            if (found) {
              setUser(stripPassword(found));
            } else {
              clearSession();
            }
          } catch {
            clearSession();
          }
        }
      }
      setLoading(false);
    }
    initSession();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const cleanUser = username.trim().toLowerCase();

    // التحقق أولاً من الحسابات الافتراضية المضمنة لتفادي أي عوائق
    const matchedDefault = DEFAULT_STAFF_USERS.find(
      (u) => u.username.toLowerCase() === cleanUser && u.password === password
    );

    if (matchedDefault) {
      saveSession(matchedDefault.username);
      const safeUser = stripPassword(matchedDefault);
      setUser(safeUser);
      return { success: true, user: safeUser };
    }

    // إذا لم تكن من الحسابات الافتراضية، يتم التحقق من قاعدة بيانات Supabase أونلاين
    try {
      const { data: found, error } = await supabase
        .from('staff_users')
        .select('*')
        .ilike('username', cleanUser)
        .maybeSingle();

      if (error || !found || found.password !== password) {
        return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      saveSession(found.username);
      const safeUser = stripPassword(found);
      setUser(safeUser);
      return { success: true, user: safeUser };
    } catch {
      return { success: false, error: 'حدث خطأ في الاتصال بالنظام' };
    }
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