import { useContext } from 'react';
import { VoyageStoreContext } from '../contexts/VoyageStoreContext';

export function useVoyageStore() {
  const ctx = useContext(VoyageStoreContext);
  if (!ctx) throw new Error('useVoyageStore must be used within <VoyageStoreProvider>');
  return ctx;
}
