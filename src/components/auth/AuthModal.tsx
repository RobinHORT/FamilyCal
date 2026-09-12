import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Lock, Mail, User, Users, Heart, ArrowRight, ShieldCheck } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  const [familyName, setFamilyName] = useState('Hort Family');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegisterMode) {
        if (!familyName.trim() || !name.trim() || !identifier.trim()) {
          throw new Error('Family name, your name, and email are required.');
        }
        await register({
          familyName: familyName.trim(),
          name: name.trim(),
          email: identifier.trim(),
          password,
          birthday: birthday || undefined,
        });
      } else {
        if (!identifier.trim()) {
          throw new Error('Please enter your username or email.');
        }
        await login(identifier.trim(), password);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="auth-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl p-7 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#F8BBD0] border border-[#F472B6]/40 flex items-center justify-center mb-3 shadow-2xs">
            <div className="relative">
              <Calendar className="w-7 h-7 text-[#831843]" />
              <Heart className="w-3.5 h-3.5 text-[#DB2777] fill-[#DB2777] absolute -bottom-1 -right-1" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-serif">
            Yimly FamilyCal
          </h1>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            {isRegisterMode
              ? 'Set up your private household calendar and organizer.'
              : 'Sign in to access your family schedules and tasks.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegisterMode && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-gray-500" /> Household Name *
                </label>
                <input
                  id="auth-family-name"
                  type="text"
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="e.g. Hort Family"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gray-500" /> Your Name (Admin) *
                </label>
                <input
                  id="auth-user-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Robin"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              {isRegisterMode ? (
                <>
                  <Mail className="w-3.5 h-3.5 text-gray-500" /> Email Address *
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5 text-gray-500" /> Username or Email *
                </>
              )}
            </label>
            <input
              id="auth-identifier"
              type={isRegisterMode ? 'email' : 'text'}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={isRegisterMode ? 'family@example.com' : 'e.g. Dad, Mum, or admin@yimly.local'}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-gray-500" /> Password *
            </label>
            <input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          {isRegisterMode && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Your Birthday (Optional)
              </label>
              <input
                id="auth-birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
              />
            </div>
          )}

          <button
            type="submit"
            id="auth-submit-btn"
            disabled={isLoading}
            className="w-full mt-2 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>{isLoading ? 'Processing...' : isRegisterMode ? 'Create Household' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col items-center gap-2.5 text-center">
          <button
            id="auth-toggle-mode-btn"
            type="button"
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError(null);
            }}
            className="text-xs font-semibold text-pink-700 hover:underline cursor-pointer"
          >
            {isRegisterMode
              ? 'Already have an account? Sign in here'
              : 'New to Yimly FamilyCal? Set up a new household'}
          </button>

          {!isRegisterMode && (
            <button
              type="button"
              id="fill-demo-credentials-btn"
              onClick={() => {
                setIdentifier('admin@yimly.local');
                setPassword('yimly123');
              }}
              className="text-[11px] text-gray-600 hover:text-gray-900 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
            >
              Autofill Sample Family Admin (admin@yimly.local)
            </button>
          )}
        </div>

        {/* Self-hosted privacy badge & public privacy policy link */}
        <div className="mt-6 flex flex-col items-center gap-1.5 pt-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Private Household Storage</span>
          </div>
          <a
            href="/privacy"
            id="auth-privacy-policy-link"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors underline cursor-pointer"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
};
