import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [resetLink, setResetLink] = useState('');

  const inputClass =
    'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 pl-10 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-argus-500 focus:ring-1 focus:ring-argus-500/50 transition-colors';
  const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none';

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/password/reset-request', { email: email.trim() });
      setResetLink(data?.reset_link ?? '');
      setSent(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
            || 'Something went wrong. Please try again.';
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
          <h1 className="text-2xl font-bold text-gray-100">Forgot Password</h1>
          <p className="text-gray-500 text-sm">Enter your account email and we'll send you a reset link.</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            {resetLink ? (
              <div className="flex flex-col items-start gap-3 bg-argus-600/10 border border-argus-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-argus-300">
                  Email delivery is not configured on this instance. Use this link to reset your password
                  (valid for 1 hour):
                </p>
                <a
                  href={resetLink}
                  className="w-full text-center bg-argus-600 hover:bg-argus-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm break-all"
                >
                  Reset Password
                </a>
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-300">
                  If an account exists for <span className="font-medium">{email.trim()}</span>, a password reset
                  link has been sent. Check your inbox (and spam folder). The link expires in 1 hour.
                </p>
              </div>
            )}
            <button
              onClick={() => { setSent(false); setEmail(''); setResetLink(''); }}
              className="w-full bg-argus-600 hover:bg-argus-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              Request Another Reset
            </button>
            <Link
              to="/login"
              className="block w-full text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className={iconClass} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
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
                'Send Reset Link'
              )}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1 w-full text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
