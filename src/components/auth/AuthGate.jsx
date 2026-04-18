// AuthGate — routes between LandingScreen (no ship picked) and AppShell.
// Stays minimal; admin lock + idle overlay land in later phases.

import { useAuth } from '../../hooks/useAuth';
import { LandingScreen } from './LandingScreen';
import { AppShell } from '../layout/AppShell';

export function AuthGate() {
  const { shipId } = useAuth();
  return shipId ? <AppShell /> : <LandingScreen />;
}
