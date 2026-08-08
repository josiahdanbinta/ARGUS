import { useState, useEffect, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Zap, Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../../api/client';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'validating' | 'invalid' | 'ready' | 'done'>('validating');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    api
      .get('/auth/password/validate-reset-token', { params: { token } })
      .then(({ data }) => setStatus(data.isValid ? 'ready' : 'invalid'))
      .catch(() => setStatus('invalid'));
  }, [token]);

  const inputClass =
    'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 pl-10 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-argus-500 focus:ring-1 focus:ring-argus-500/50 transition-colors';
  const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none';

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/password/reset-confirm', { token, new_password: password });
      setStatus('done');
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
            || 'Failed to reset password. The link may have expired.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-light to-gray-900 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-argus-600/20 border border-argus-500/30">
            <Zap className="w-6 h-6 text-argus-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Reset Password</h1>
          <p className="text-gray-500 text-sm">Choose a new password for your account.</p>
        </div>

        {status === 'validating' && (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">
                This reset link is invalid or has expired. Request a new one from the forgot password page.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="block w-full text-center bg-argus-600 hover:bg-argus-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              Request New Link
            </Link>
            <Link
              to="/login"
              className="block w-full text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to login
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">New Password</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  autoFocus
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-argus-600 hover:bg-argus-700 disabled:bg-argus-600/50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        )}

        {status === 'done' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-300">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
            </div>
            <Link
              to="/login"
              className="block w-full text-center bg-argus-600 hover:bg-argus-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
