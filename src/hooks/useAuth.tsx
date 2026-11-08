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
const CUSTOM_CREDENTIALS_KEY = 'sal_custom_staff_passwords'; // لحفظ أي تعديلات للباسورد من داخل التطبيق أونلاين

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

// دالة لجلب كلمات المرور المحدثة إذا تم تغييرها من داخل التطبيق
function getStoredPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CUSTOM_CREDENTIALS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function saveCustomPassword(username: string, newPass: string): void {
  try {
    const current = getStoredPasswords();
    current[username.toLowerCase()] = newPass;
    localStorage.setItem(CUSTOM_CREDENTIALS_KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
}

// الحسابات الأساسية المطلوبة مع إمكانية تحديث كلمات مرورها من داخل الأبلكيشن
const DEFAULT_STAFF_USERS: StaffUser[] = [
  {
    id: 'super-admin-shery',
    username: 'shery',
    password: 'shery123',
    display_name: 'shery (مدير النظام)',
    role: 'admin',
    is_super_admin: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'staff-drmarwa',
    username: 'DRmarwa',
    password: 'marwa',
    display_name: 'DRmarwa (طبيبة / مشرف)',
    role: 'admin',
    is_super_admin: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'staff-dr-elsalam',
    username: 'dr',
    password: 'elsalam',
    display_name: 'dr (استقبال / نظام)',
    role: 'receptionist',
    is_super_admin: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const staffStorage = {
  async list(): Promise<StaffUser[]> {
    const customPasses = getStoredPasswords();
    const defaultsWithCustomPasses = DEFAULT_STAFF_USERS.map(u => ({
      ...u,
      password: customPasses[u.username.toLowerCase()] || u.password
    }));

    const { data, error } = await supabase.from('staff_users').select('*').order('created_at', { ascending: true });
    const cloudUsers = (error || !data) ? [] : (data as StaffUser[]);
    
    // دمج الحسابات الافتراضية مع الحسابات السحابية الأخرى وعدم تكرارها
    const existingUsernames = new Set(cloudUsers.map(u => u.username.toLowerCase()));
    const filteredDefaults = defaultsWithCustomPasses.filter(u => !existingUsernames.has(u.username.toLowerCase()));
    
    return [...filteredDefaults, ...cloudUsers];
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

    const lower = username.toLowerCase();
    if (['shery', 'drmarwa', 'dr'].includes(lower)) {
      return { user: null, error: 'اسم المستخدم هذا محجوز للحسابات الأساسية' };
    }

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
    // التحقق إذا كان التعديل يخص أحد الحسابات الأساسية الثابتة
    const targetDefault = DEFAULT_STAFF_USERS.find(u => u.id === input.id || u.username.toLowerCase() === input.id.toLowerCase());
    if (targetDefault) {
      if (input.password) {
        if (input.password.length < 6) {
          return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
        }
        saveCustomPassword(targetDefault.username, input.password);
      }
      const updatedUser: StaffUser = {
        ...targetDefault,
        display_name: input.display_name,
        password: input.password ? input.password : targetDefault.password,
        updated_at: new Date().toISOString(),
      };
      return { user: updatedUser, error: null };
    }

    const updateFields: any = {
      display_name: input.display_name,
      role: input.role,
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    };
    if (input.password) {
      if (input.password.length < 6) return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
      updateFields.password = input.password;
    }

    const { data, error } = await supabase.from('staff_users').update(updateFields).eq('id', input.id).select().single();
    if (error || !data) return { user: null, error: error?.message || 'فشل التعديل' };
    return { user: data as StaffUser, error: null };
  },

  async remove(id: string): Promise<{ error: string | null }> {
    if (['super-admin-shery', 'staff-drmarwa', 'staff-dr-elsalam'].includes(id)) {
      return { error: 'لا يمكن حذف الحسابات الأساسية للنظام' };
    }
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
        const lower = username.toLowerCase();
        const foundDefault = DEFAULT_STAFF_USERS.find(u => u.username.toLowerCase() === lower);
        if (foundDefault) {
          const customPasses = getStoredPasswords();
          setUser({
            ...foundDefault,
            password: customPasses[foundDefault.username.toLowerCase()] || foundDefault.password
          });
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
    const customPasses = getStoredPasswords();

    // التحقق من الحسابات الثلاثة الأساسية فوراً
    const matchedDefault = DEFAULT_STAFF_USERS.find(u => u.username.toLowerCase() === cleanUser);
    if (matchedDefault) {
      const activePass = customPasses[matchedDefault.username.toLowerCase()] || matchedDefault.password;
      if (password === activePass) {
        const loggedUser = { ...matchedDefault, password: activePass };
        saveSession(matchedDefault.username);
        setUser(loggedUser);
        return { success: true, user: loggedUser };
      } else {
        return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }
    }

    // التحقق من باقي المستخدمين السحابيين
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