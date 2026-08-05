import { authRepository } from '@/repositories/api-repositories';
import { ApiError, apiRequest, sessionManager } from '@/services/api';
import { preferenceStorage, secureSessionStorage } from '@/services/storage';
import { AuthSession, Permission, User } from '@/types';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

type AuthContextValue = {
  session: AuthSession | null;
  user: User | null;
  ready: boolean;
  requiresPropertySelection: boolean;
  savedUsername: string;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (firstName: string, lastName: string) => Promise<User>;
  completePropertySelection: () => void;
  hasPermission: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseStoredSession(value: string): AuthSession {
  const parsed = JSON.parse(value) as Partial<AuthSession>;
  if (!parsed || typeof parsed !== 'object'
    || typeof parsed.accessToken !== 'string' || !parsed.accessToken
    || typeof parsed.refreshToken !== 'string' || !parsed.refreshToken
    || typeof parsed.expiresAt !== 'string'
    || !parsed.user || typeof parsed.user.id !== 'string') {
    throw new Error('Sesiunea salvată este invalidă.');
  }
  return parsed as AuthSession;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [requiresPropertySelection, setRequiresPropertySelection] = useState(false);
  const [savedUsername, setSavedUsername] = useState('');

  useEffect(() => sessionManager.subscribe(setSession), []);

  useEffect(() => {
    Promise.all([secureSessionStorage.get(), preferenceStorage.get('username')]).then(async ([stored, username]) => {
      setSavedUsername(username ?? '');
      if (!stored) return;
      let parsed: AuthSession;
      try {
        parsed = parseStoredSession(stored);
      } catch {
        sessionManager.setPersistence(false);
        sessionManager.set(null);
        await secureSessionStorage.remove();
        return;
      }

      sessionManager.setPersistence(true);
      sessionManager.set(parsed);
      try {
        const user = await apiRequest<User>('/auth/me');
        const activeSession = sessionManager.get();
        if (!activeSession) throw new Error('Sesiunea nu a putut fi reînnoită.');
        const restored = { ...activeSession, user };
        setRequiresPropertySelection(false);
        sessionManager.set(restored);
        setSession(restored);
        try {
          await secureSessionStorage.set(JSON.stringify(restored));
        } catch {
          // Sesiunea reînnoită rămâne activă chiar dacă stocarea dispozitivului răspunde temporar lent.
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status === 401 || error.status === 403) {
          sessionManager.setPersistence(false);
          sessionManager.set(null);
          await secureSessionStorage.remove();
          return;
        }
        // Păstrează sesiunea memorată când serverul este temporar indisponibil.
        // Sincronizarea periodică o va reînnoi imediat ce revine conexiunea.
        const preserved = sessionManager.get() ?? parsed;
        sessionManager.set(preserved);
        setSession(preserved);
      }
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !session?.user.id) return;
    let syncing = false;
    const syncAccess = async () => {
      if (syncing || !sessionManager.get()) return;
      syncing = true;
      try {
        const user = await apiRequest<User>('/auth/me');
        const current = sessionManager.get();
        if (!current || current.user.id !== user.id) return;
        if (JSON.stringify(current.user) === JSON.stringify(user)) return;
        const next = { ...current, user };
        sessionManager.set(next);
        if (await secureSessionStorage.get()) await secureSessionStorage.set(JSON.stringify(next));
      } catch {
        // API-ul invalidează automat sesiunea dacă utilizatorul a fost dezactivat.
      } finally {
        syncing = false;
      }
    };
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void syncAccess();
    });
    const interval = setInterval(() => void syncAccess(), 8000);
    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [ready, session?.user.id]);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const next = await authRepository.login(username.trim(), password, `${Platform.OS} ${Platform.Version}`, remember);
    setRequiresPropertySelection(next.user.role === 'ADMIN');
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
    setRequiresPropertySelection(false);
    await secureSessionStorage.remove();
  }, []);

  const updateProfile = useCallback(async (firstName: string, lastName: string) => {
    const updatedUser = await authRepository.updateProfile(firstName.trim(), lastName.trim());
    const current = sessionManager.get();
    if (!current) throw new Error('Sesiunea curentă nu mai este disponibilă.');

    const next = { ...current, user: { ...current.user, ...updatedUser } };
    sessionManager.set(next);
    try {
      if (await secureSessionStorage.get()) await secureSessionStorage.set(JSON.stringify(next));
    } catch { /* The in-memory profile remains current even if device storage is unavailable. */ }
    return next.user;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    ready,
    requiresPropertySelection,
    savedUsername,
    login,
    logout,
    changePassword: authRepository.changePassword,
    updateProfile,
    completePropertySelection: () => setRequiresPropertySelection(false),
    hasPermission: (permission) => session?.user.isPrimaryAdmin === true || session?.user.permissions.includes(permission) === true,
  }), [login, logout, ready, requiresPropertySelection, savedUsername, session, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
