import { useAuth } from '@/contexts/AuthContext';
import { propertyRepository } from '@/repositories/api-repositories';
import { setActivePropertyApi } from '@/services/api';
import { preferenceStorage } from '@/services/storage';
import { Property } from '@/types';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type PropertyContextValue = {
  properties: Property[];
  activeProperty: Property | null;
  loading: boolean;
  error: string | null;
  selectProperty: (property: Property) => Promise<void>;
  reload: () => Promise<void>;
};

const PropertyContext = createContext<PropertyContextValue | null>(null);

export function PropertyProvider({ children }: PropsWithChildren) {
  const { user, requiresPropertySelection, completePropertySelection } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiresPropertySelectionRef = useRef(requiresPropertySelection);
  requiresPropertySelectionRef.current = requiresPropertySelection;
  // Token renewal replaces the session (and therefore the User object) even
  // when access to properties did not change. Keep reload dependencies tied to
  // the actual access data so a routine token refresh does not tear down the
  // active tab navigator and send the user back to its initial route.
  const userId = user?.id ?? '';
  const userRole = user?.role ?? null;
  const propertyIdsKey = user ? [...user.propertyIds].sort().join('\u0000') : '';

  const reload = useCallback(async () => {
    if (!userId) { setProperties([]); setActivePropertyApi(null); setActiveProperty(null); return; }
    setLoading(true);
    setError(null);
    try {
      const allowedPropertyIds = propertyIdsKey ? propertyIdsKey.split('\u0000') : [];
      const result = (await propertyRepository.list()).filter((property) => userRole === 'ADMIN' || allowedPropertyIds.includes(property.id));
      setProperties(result);
      const storedId = await preferenceStorage.get(`property.${userId}`);
      const stored = result.find((property) => property.id === storedId);
      setActiveProperty((current) => {
        const currentAllowed = result.find((property) => property.id === current?.id);
        if (userRole === 'ADMIN' && requiresPropertySelectionRef.current) {
          setActivePropertyApi(null);
          return null;
        }
        const selected = currentAllowed ?? stored ?? result[0] ?? null;
        setActivePropertyApi(selected);
        if (selected && selected.id !== storedId) void preferenceStorage.set(`property.${userId}`, selected.id);
        return selected;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Proprietățile nu au putut fi încărcate.');
    } finally { setLoading(false); }
  }, [propertyIdsKey, userId, userRole]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setActivePropertyApi(activeProperty); }, [activeProperty]);

  const selectProperty = useCallback(async (property: Property) => {
    setActivePropertyApi(property);
    setActiveProperty(property);
    completePropertySelection();
    if (userId) await preferenceStorage.set(`property.${userId}`, property.id);
  }, [completePropertySelection, userId]);

  const value = useMemo(() => ({ properties, activeProperty, loading, error, selectProperty, reload }), [activeProperty, error, loading, properties, reload, selectProperty]);
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useProperty() {
  const value = useContext(PropertyContext);
  if (!value) throw new Error('useProperty must be used inside PropertyProvider');
  return value;
}
