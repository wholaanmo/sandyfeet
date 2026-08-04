'use client';

// components/auth/SessionProvider.js
// Client component that fetches display-only actor data from the server session.
// This is NOT used for authorization — display only (name, role badge, etc.).
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * @typedef {Object} DisplayActor
 * @property {string} uid
 * @property {'admin' | 'staff' | 'guest'} role
 * @property {string | null} email
 * @property {string | null} displayName
 */

/**
 * @typedef {Object} SessionContextValue
 * @property {DisplayActor | null} actor - Display-only actor info (null if not authenticated)
 * @property {boolean} loading - Whether the session is still being resolved
 * @property {() => Promise<void>} refresh - Re-fetch actor data from the server
 */

const SessionContext = createContext(/** @type {SessionContextValue} */ ({
  actor: null,
  loading: true,
  refresh: async () => {},
}));

/**
 * Hook to access display-only session data.
 * IMPORTANT: Do NOT use this for authorization decisions.
 *
 * @returns {SessionContextValue}
 */
export function useSession() {
  return useContext(SessionContext);
}

/**
 * SessionProvider fetches display-only actor data from /api/auth/me on mount.
 * Falls back gracefully if the session is invalid (actor = null, loading = false).
 *
 * @param {{ children: React.ReactNode }} props
 */
export function SessionProvider({ children }) {
  const [actor, setActor] = useState(/** @type {DisplayActor | null} */ (null));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!res.ok) {
        setActor(null);
        return;
      }

      const json = await res.json();
      if (json.ok && json.data) {
        setActor({
          uid: json.data.uid,
          role: json.data.role,
          email: json.data.email || null,
          displayName: json.data.displayName || null,
        });
      } else {
        setActor(null);
      }
    } catch {
      // Network error or unexpected failure — degrade gracefully
      setActor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ actor, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}
