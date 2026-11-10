import { useState, useEffect } from 'react';

export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error("Error reading localStorage key", key, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent(`persistent-state:${key}`, { detail: state }));
    } catch (error) {
      console.error("Error setting localStorage key", key, error);
    }
  }, [key, state]);

  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail !== undefined) {
        setState(prev => (JSON.stringify(prev) === JSON.stringify(e.detail) ? prev : e.detail));
      }
    };
    const handleStorage = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue);
          setState(prev => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
        } catch {}
      }
    };
    window.addEventListener(`persistent-state:${key}`, handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(`persistent-state:${key}`, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [key]);

  return [state, setState];
}
