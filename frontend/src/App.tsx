import { Loader } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import AppRoutes from './routes';
import DashboardLayout from './components/layouts/DashboardLayout';
import LoginPage from './pages/Login';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <Loader className="w-8 h-8 text-argus-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <DashboardLayout>
      <AppRoutes />
    </DashboardLayout>
  );
}

export default App;
