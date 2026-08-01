import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

type FocusRefresh = () => void | Promise<void>;

/**
 * Refreshes an already-mounted route whenever it becomes focused again.
 * The initial focus relies on the screen's regular mount load, preventing
 * the two requests from racing each other.
 */
export function useRefreshOnFocus(refresh: FocusRefresh, busy = false) {
  const refreshRef = useRef(refresh);
  const busyRef = useRef(busy);
  const firstFocusRef = useRef(true);

  refreshRef.current = refresh;
  busyRef.current = busy;

  useFocusEffect(useCallback(() => {
    const firstFocus = firstFocusRef.current;
    firstFocusRef.current = false;

    if (busyRef.current) return;
    if (firstFocus) return;

    void refreshRef.current();
  }, []));
}
