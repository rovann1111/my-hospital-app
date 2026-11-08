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
const USERS_KEY = 'sal_staff_users_v2';

// الحسابات الأساسية الثابتة
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

type StoredStaffUser = StaffUser & { password: string };

function loadStoredUsers(): StoredStaffUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      const initial: StoredStaffUser[] = DEFAULT_STAFF_USERS;
      localStorage.setItem(USERS_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as StoredStaffUser[];
    if (!Array.isArray(parsed)) return DEFAULT_STAFF_USERS;
    
    // تأكد من وجود الحسابات الأساسية الثلاثة دائماً
    let updated = [...parsed];
    for (const def of DEFAULT_STAFF_USERS) {
      const idx = updated.findIndex(u => u.username.toLowerCase() === def.username.toLowerCase());
      if (idx === -1) {
        updated.push(def);
      } else {
        // الحفاظ على الباسورد المحدث لو المستخدم غيره
        updated[idx] = {
          ...def,
          password: updated[idx].password || def.password,
          display_name: updated[idx].display_name || def.display_name,
        };
      }
    }
    return updated;
  } catch {
    return DEFAULT_STAFF_USERS;
  }
}

function saveStoredUsers(users: StoredStaffUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* ignore */
  }
}

function stripPassword(u: StoredStaffUser): StaffUser {
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

// أدوات إدارة المستخدمين متوافقة تماماً وبدون تعليق مع الشاشة
export const staffStorage = {
  list(): StaffUser[] {
    return loadStoredUsers().map(stripPassword);
  },

  add(input: {
    username: string;
    password: string;
    display_name: string;
    role: StaffUser['role'];
  }): { user: StaffUser | null; error: string | null } {
    const users = loadStoredUsers();
    const username = input.username.trim();
    if (username.length < 3) return { user: null, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' };
    if (input.password.length < 6) return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { user: null, error: 'اسم المستخدم مستخدم بالفعل، اختر اسماً آخر' };
    }

    const newUser: StoredStaffUser = {
      id: crypto.randomUUID(),
      username,
      password: input.password,
      display_name: input.display_name,
      role: input.role,
      is_super_admin: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveStoredUsers([...users, newUser]);
    return { user: stripPassword(newUser), error: null };
  },

  update(input: {
    id: string;
    display_name: string;
    role: StaffUser['role'];
    is_active: boolean;
    password: string;
  }): { user: StaffUser | null; error: string | null } {
    const users = loadStoredUsers();
    const idx = users.findIndex((u) => u.id === input.id);
    if (idx === -1) return { user: null, error: 'المستخدم غير موجود' };
    
    const target = users[idx];
    if (input.password && input.password.length < 6) {
      return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    }

    const updated: StoredStaffUser = {
      ...target,
      display_name: input.display_name,
      role: target.is_super_admin ? target.role : input.role,
      is_active: target.is_super_admin ? true : input.is_active,
      password: input.password ? input.password : target.password,
      updated_at: new Date().toISOString(),
    };

    const next = [...users];
    next[idx] = updated;
    saveStoredUsers(next);
    return { user: stripPassword(updated), error: null };
  },

  remove(id: string): { error: string | null } {
    const users = loadStoredUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return { error: 'المستخدم غير موجود' };
    if (target.is_super_admin || ['shery', 'drmarwa', 'dr'].includes(target.username.toLowerCase())) {
      return { error: 'لا يمكن حذف الحسابات الأساسية للنظام' };
    }

    saveStoredUsers(users.filter((u) => u.id !== id));
    return { error: null };
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
    const sessionUser = loadSession();
    if (sessionUser) {
      const users = loadStoredUsers();
      const found = users.find((u) => u.username.toLowerCase() === sessionUser.toLowerCase() && u.is_active);
      if (found) {
        setUser(stripPassword(found));
      } else {
        clearSession();
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const users = loadStoredUsers();
    const cleanUser = username.trim().toLowerCase();
    const found = users.find((u) => u.username.toLowerCase() === cleanUser);

    if (!found || found.password !== password) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
    if (!found.is_active) {
      return { success: false, error: 'هذا الحساب معطّل. تواصل مع المدير' };
    }

    saveSession(found.username);
    const safeUser = stripPassword(found);
    setUser(safeUser);
    return { success: true, user: safeUser };
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