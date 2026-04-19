import { ThemeProvider } from './contexts/ThemeProvider';
import { ToastProvider } from './contexts/ToastProvider';
import { AuthProvider } from './auth/AuthProvider';
import { SessionProvider } from './contexts/SessionProvider';
import { AuthGate } from './components/auth/AuthGate';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        {/* SessionProvider wraps AuthProvider during the pivot. Nothing
            reads from it yet (Phase 3 swaps LandingScreen to useSession);
            AuthProvider continues to power the existing code. Once Phase 4
            finishes, AuthProvider comes out. */}
        <SessionProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </SessionProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
