import { useAuth } from './contexts/AuthContext';
import AppRoutes from './routes';
import DashboardLayout from './components/layouts/DashboardLayout';
import LoginPage from './pages/Login';

function App() {
  const { isAuthenticated } = useAuth();

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
