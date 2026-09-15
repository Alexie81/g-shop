import { AuthSession, Property } from '@/types';
import { secureSessionStorage } from '@/services/storage';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://reparatiicalculatoare-bucuresti.ro/app-api').replace(/\/$/, '');
const SHOP_API_URL = (process.env.EXPO_PUBLIC_SHOP_API_URL ?? 'https://calculatoareprofesionale.ro/app-api').replace(/\/$/, '');
const SCOOTER_API_URL = (process.env.EXPO_PUBLIC_SCOOTER_API_URL ?? 'https://gshop-trotinete.ro/app-api').replace(/\/$/, '');
let currentSession: AuthSession | null = null;
let persistSession = false;
let refreshing: Promise<AuthSession | null> | null = null;
let activePropertyApiUrl = API_URL;
const sessionListeners = new Set<(session: AuthSession | null) => void>();

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export const sessionManager = {
  get: () => currentSession,
  set: (session: AuthSession | null) => {
    currentSession = session;
    sessionListeners.forEach((listener) => listener(session));
  },
  setPersistence: (persist: boolean) => { persistSession = persist; },
  subscribe: (listener: (session: AuthSession | null) => void) => {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
  },
};

type RequestOptions = RequestInit & { authenticated?: boolean; retry?: boolean };

async function refreshSession() {
  if (!currentSession?.refreshToken) return null;
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: currentSession.refreshToken, remember: persistSession }),
    }).then(async (response) => {
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new ApiError('Sesiunea nu poate fi reînnoită momentan.', response.status);
      const session = (await response.json()).data as AuthSession;
      sessionManager.set(session);
      if (persistSession) await secureSessionStorage.set(JSON.stringify(session));
      return session;
    }).finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function requestFrom<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.authenticated !== false && currentSession?.accessToken) {
    headers.set('Authorization', `Bearer ${currentSession.accessToken}`);
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: controller.signal });
    if (response.status === 401 && options.authenticated !== false) {
      if (options.retry !== false) {
        const refreshed = await refreshSession();
        if (refreshed) return requestFrom<T>(baseUrl, path, { ...options, retry: false });
      }
      persistSession = false;
      sessionManager.set(null);
      await secureSessionStorage.remove();
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(payload.message ?? 'Cererea nu a putut fi procesată.', response.status, payload.errors);
    return payload.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('Serverul răspunde prea lent. Încearcă din nou.', 408);
    throw new ApiError('Nu se poate realiza conexiunea la serverul G-Shop.', 0, error);
  } finally {
    clearTimeout(timer);
  }
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestFrom<T>(API_URL, path, options);
}

export function shopApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestFrom<T>(SHOP_API_URL, path, options);
}

export function apiUrlForProperty(property: Pick<Property, 'domain' | 'type'> | null) {
  const domain = property?.domain.trim().toLocaleLowerCase('ro-RO') ?? '';
  return domain === 'gshop-trotinete.ro' || domain.endsWith('.gshop-trotinete.ro')
    ? SCOOTER_API_URL
    : property?.type === 'SHOP'
      ? SHOP_API_URL
      : API_URL;
}

export function setActivePropertyApi(property: Pick<Property, 'domain' | 'type'> | null) {
  activePropertyApiUrl = apiUrlForProperty(property);
}

export function propertyApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestFrom<T>(activePropertyApiUrl, path, options);
}

export { API_URL, SHOP_API_URL, SCOOTER_API_URL };
