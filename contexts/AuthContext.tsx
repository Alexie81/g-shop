import { authRepository } from '@/repositories/api-repositories';
import { apiRequest, sessionManager } from '@/services/api';
import { preferenceStorage, secureSessionStorage } from '@/services/storage';
import { AuthSession, Permission, User } from '@/types';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type AuthContextValue = {
  session: AuthSession | null;
  user: User | null;
  ready: boolean;
  savedUsername: string;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [savedUsername, setSavedUsername] = useState('');

  useEffect(() => {
    Promise.all([secureSessionStorage.get(), preferenceStorage.get('username')]).then(async ([stored, username]) => {
      setSavedUsername(username ?? '');
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as AuthSession;
        sessionManager.setPersistence(true);
        sessionManager.set(parsed);
        const user = await apiRequest<User>('/auth/me');
        const restored = { ...parsed, user };
        sessionManager.set(restored);
        setSession(restored);
      } catch {
        sessionManager.setPersistence(false);
        sessionManager.set(null);
        await secureSessionStorage.remove();
      }
    }).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const next = await authRepository.login(username.trim(), password, `${Platform.OS} ${Platform.Version}`);
    sessionManager.setPersistence(remember);
    sessionManager.set(next);
    setSession(next);
    if (remember) {
      await Promise.all([secureSessionStorage.set(JSON.stringify(next)), preferenceStorage.set('username', username.trim())]);
      setSavedUsername(username.trim());
    } else {
      await Promise.all([secureSessionStorage.remove(), preferenceStorage.remove('username')]);
      setSavedUsername('');
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authRepository.logout(); } catch { /* Local logout must always succeed. */ }
    sessionManager.set(null);
    sessionManager.setPersistence(false);
    setSession(null);
    await secureSessionStorage.remove();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    ready,
    savedUsername,
    login,
    logout,
    changePassword: authRepository.changePassword,
    hasPermission: (permission) => session?.user.role === 'ADMIN' || session?.user.permissions.includes(permission) === true,
  }), [login, logout, ready, savedUsername, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
