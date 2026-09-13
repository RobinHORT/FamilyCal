import React, { useState, useEffect } from 'react';
import { Users, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';

interface ViewerLoginProps {
  onSuccess: () => void;
}

export function ViewerLogin({ onSuccess }: ViewerLoginProps) {
  const [familyName, setFamilyName] = useState<string>('Household Family');
  const [hasViewerPassword, setHasViewerPassword] = useState<boolean>(true);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadViewerInfo() {
      try {
        const info = await api.getViewerInfo();
        if (isMounted) {
          setFamilyName(info.familyName);
          setHasViewerPassword(info.hasViewerPassword);
        }
      } catch (err: any) {
        console.error('Failed to fetch viewer info:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadViewerInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasViewerPassword && !password) {
      setError('Please enter the Household Viewer Password.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.viewerLogin(password);
      if (res.token) {
        localStorage.setItem('yimly_jwt_token', res.token);
        localStorage.setItem('familycal_viewer_mode', 'true');
        onSuccess();
      } else {
        setError('Authentication failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Incorrect Household Viewer password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200/80 shadow-xl p-8 space-y-6">
        {/* Primary Household Identity Header (NOT FamilyCal) */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#F8BBD0] border border-[#F472B6]/40 flex items-center justify-center shadow-xs mx-auto">
            <Users className="w-7 h-7 text-[#831843]" />
          </div>
          <h1 id="viewer-household-name" className="text-2xl font-bold text-gray-900 tracking-tight font-serif">
            {isLoading ? 'Loading...' : familyName}
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            Tablet & Wall Display Viewer Mode
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {hasViewerPassword ? (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span>Household Viewer Password</span>
              </label>
              <div className="relative">
                <input
                  id="viewer-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter viewer password"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-900 focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium text-center">
              No Household Viewer Password has been configured yet by the administrator. Click below to view the calendar.
            </div>
          )}

          <button
            id="viewer-sign-in-btn"
            type="submit"
            disabled={isSubmitting || isLoading}
            className="w-full py-3.5 px-4 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In to Viewer</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-2 text-center">
          <a
            href="/"
            className="text-xs text-gray-600 hover:text-gray-800 font-medium hover:underline transition-colors"
          >
            Switch to Member Login
          </a>
        </div>
      </div>
    </div>
  );
}
