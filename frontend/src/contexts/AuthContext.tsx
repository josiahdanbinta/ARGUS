import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../api/client';
import { useAppStore } from '../store';
import type { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; full_name: string; password: string; organization_name?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, setUser } = useAppStore();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      api.get('/auth/profile')
        .then(({ data }) => {
          setUser(data);
          setIsAuthenticated(true);
        })
        .catch(() => {
          localStorage.clear();
          setIsAuthenticated(false);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [setUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const { data: profile } = await api.get('/auth/profile');
    setUser(profile);
    setIsAuthenticated(true);
  }, [setUser]);

  const register = useCallback(async (registerData: {
    email: string;
    username: string;
    full_name: string;
    password: string;
    organization_name?: string;
  }) => {
    await api.post('/auth/register', registerData);
    await login(registerData.email, registerData.password);
  }, [login]);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
    localStorage.clear();
    setUser(null);
    setIsAuthenticated(false);
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
