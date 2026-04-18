import { ThemeProvider } from './contexts/ThemeProvider';
import { ToastProvider } from './contexts/ToastProvider';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGate } from './components/auth/AuthGate';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
