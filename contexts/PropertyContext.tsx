import { useAuth } from '@/contexts/AuthContext';
import { propertyRepository } from '@/repositories/api-repositories';
import { preferenceStorage } from '@/services/storage';
import { Property } from '@/types';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) { setProperties([]); setActiveProperty(null); return; }
    setLoading(true);
    setError(null);
    try {
      const result = (await propertyRepository.list()).filter((property) => user.role === 'ADMIN' || user.propertyIds.includes(property.id));
      setProperties(result);
      const storedId = await preferenceStorage.get(`property.${user.id}`);
      const stored = result.find((property) => property.id === storedId);
      setActiveProperty((current) => {
        const currentAllowed = result.find((property) => property.id === current?.id);
        if (user.role === 'ADMIN' && !currentAllowed) return null;
        const selected = currentAllowed ?? stored ?? result[0] ?? null;
        if (selected && selected.id !== storedId) void preferenceStorage.set(`property.${user.id}`, selected.id);
        return selected;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Proprietățile nu au putut fi încărcate.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const selectProperty = useCallback(async (property: Property) => {
    setActiveProperty(property);
    if (user) await preferenceStorage.set(`property.${user.id}`, property.id);
  }, [user]);

  const value = useMemo(() => ({ properties, activeProperty, loading, error, selectProperty, reload }), [activeProperty, error, loading, properties, reload, selectProperty]);
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useProperty() {
  const value = useContext(PropertyContext);
  if (!value) throw new Error('useProperty must be used inside PropertyProvider');
  return value;
}
