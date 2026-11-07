import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StaffUser } from '@/lib/supabase';

// ---- Client-side staff auth (browser-only) ----
//
// NOTE: This is intentionally a local-only auth implementation, per the
// project owner's explicit request. Credentials live in localStorage and
// are checked in the browser. The default super-admin (shery / shery123) is
// seeded automatically; additional staff created via the User Management
// screen are also stored in localStorage and verified the same way.
//
// Be aware this is NOT secure against a determined user with browser access:
// anyone can read the stored credentials or flip the auth flag in their own
// browser. Use only for the local/demo context the owner has chosen.

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

const SESSION_KEY = 'sal_staff_session'; // { isAuthenticated, currentUser }
const USERS_KEY = 'sal_staff_users'; // array of StoredStaffUser

type StoredStaffUser = StaffUser & { password: string };

const DEFAULT_USERS: StoredStaffUser[] = [
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
];

function loadStoredUsers(): StoredStaffUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      // Seed defaults on first run.
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    const parsed = JSON.parse(raw) as StoredStaffUser[];
    if (!Array.isArray(parsed)) return DEFAULT_USERS;
    // Make sure shery always exists and is a super-admin.
    if (!parsed.some((u) => u.username === 'shery')) {
      const merged = [DEFAULT_USERS[0], ...parsed];
      localStorage.setItem(USERS_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch {
    return DEFAULT_USERS;
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

// Exposed helpers for the User Management screen.
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
    password: string; // empty => no change
  }): { user: StaffUser | null; error: string | null } {
    const users = loadStoredUsers();
    const idx = users.findIndex((u) => u.id === input.id);
    if (idx === -1) return { user: null, error: 'المستخدم غير موجود' };
    const target = users[idx];
    if (target.is_super_admin && input.is_active === false) {
      return { user: null, error: 'لا يمكن تعطيل حساب المدير العام' };
    }
    if (input.password && input.password.length < 6) {
      return { user: null, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    }
    const updated: StoredStaffUser = {
      ...target,
      display_name: input.display_name,
      role: target.is_super_admin ? target.role : input.role, // don't demote super-admin
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
    if (target.is_super_admin) return { error: 'لا يمكن حذف حساب المدير العام' };
    saveStoredUsers(users.filter((u) => u.id !== id));
    return { error: null };
  },
};

type StoredSession = {
  isAuthenticated: boolean;
  currentUser: string; // username
};

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.isAuthenticated || !parsed?.currentUser) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(username: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ isAuthenticated: true, currentUser: username }));
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

  // On mount, restore any persisted session.
  useEffect(() => {
    const session = loadSession();
    if (session) {
      const users = loadStoredUsers();
      const found = users.find((u) => u.username === session.currentUser && u.is_active);
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
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!found || found.password !== password) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
    if (!found.is_active) {
      return { success: false, error: 'هذا الحساب معطّل. تواصل مع المدير' };
    }
    saveSession(found.username);
    const safe = stripPassword(found);
    setUser(safe);
    return { success: true, user: safe };
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
