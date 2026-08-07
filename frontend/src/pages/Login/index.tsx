import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Zap, Mail, Lock, User, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'login' | 'register';

interface FormData {
  email: string;
  password: string;
  username: string;
  full_name: string;
  organization_name: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  username?: string;
  full_name?: string;
}

const initialForm: FormData = {
  email: '',
  password: '',
  username: '',
  full_name: '',
  organization_name: '',
};

function validate(form: FormData, mode: Mode): FormErrors {
  const errors: FormErrors = {};

  if (!form.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Invalid email address';
  }

  if (!form.password) {
    errors.password = 'Password is required';
  } else if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }

  if (mode === 'register') {
    if (!form.username.trim()) {
      errors.username = 'Username is required';
    }
    if (!form.full_name.trim()) {
      errors.full_name = 'Full name is required';
    }
  }

  return errors;
}

export default function LoginPage() {
  const { login, register: authRegister } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field as keyof FormErrors];
      return next;
    });
    setSubmitError('');
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();

    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setSubmitError('');

    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await authRegister({
          email: form.email,
          password: form.password,
          username: form.username,
          full_name: form.full_name,
          organization_name: form.organization_name.trim() || undefined,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
            || 'Authentication failed. Please try again.';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setErrors({});
    setSubmitError('');
    setForm(initialForm);
  }

  const inputClass =
    'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 pl-10 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-argus-500 focus:ring-1 focus:ring-argus-500/50 transition-colors';
  const errorClass = 'text-red-400 text-xs mt-1';
  const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none';

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-light to-gray-900 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-argus-600/20 border border-argus-500/30">
            <Zap className="w-6 h-6 text-argus-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">ARGUS</h1>
          <p className="text-gray-500 text-sm">Advance Response & Guard Unified System</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-surface rounded-lg p-1 border border-surface-border">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-argus-600/20 text-argus-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-argus-600/20 text-argus-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4" noValidate>
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
                <div className="relative">
                  <User className={iconClass} />
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => updateField('username', e.target.value)}
                    placeholder="johndoe"
                    className={`${inputClass} ${errors.username ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                    autoComplete="username"
                  />
                </div>
                {errors.username && <p className={errorClass}>{errors.username}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className={iconClass} />
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    placeholder="John Doe"
                    className={`${inputClass} ${errors.full_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                    autoComplete="name"
                  />
                </div>
                {errors.full_name && <p className={errorClass}>{errors.full_name}</p>}
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className={iconClass} />
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="you@company.com"
                className={`${inputClass} ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                autoComplete="email"
              />
            </div>
            {errors.email && <p className={errorClass}>{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className={iconClass} />
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {errors.password && <p className={errorClass}>{errors.password}</p>}
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Organization Name <span className="text-gray-600">(optional)</span>
              </label>
              <div className="relative">
                <Building2 className={iconClass} />
                <input
                  type="text"
                  value={form.organization_name}
                  onChange={(e) => updateField('organization_name', e.target.value)}
                  placeholder="Acme Corp"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {submitError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-argus-600 hover:bg-argus-700 disabled:bg-argus-600/50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
