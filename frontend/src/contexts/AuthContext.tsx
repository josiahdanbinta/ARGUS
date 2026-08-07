import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../api/client';
import { useAppStore } from '../store';
import type { User } from '../types';

export class MFARequiredError extends Error {
  mfaToken: string;
  constructor(mfaToken: string) {
    super('MFA required');
    this.name = 'MFARequiredError';
    this.mfaToken = mfaToken;
  }
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  mfaRequired: (mfaToken: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; full_name: string; password: string; organization_name?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  mfaRequired: async () => { throw new Error('not implemented'); },
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
    if (data.requires_mfa) {
      throw new MFARequiredError(data.mfa_token);
    }
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const { data: profile } = await api.get('/auth/profile');
    setUser(profile);
    setIsAuthenticated(true);
  }, [setUser]);

  const mfaRequired = useCallback(async (mfaToken: string, code: string) => {
    const { data } = await api.post('/auth/mfa/login', { mfa_token: mfaToken, code });
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
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, mfaRequired, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
