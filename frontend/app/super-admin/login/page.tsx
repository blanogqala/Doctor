'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  Eye,
  EyeOff,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const REMEMBER_KEY = 'sa_remember_email';
const SUPPORT_MAIL = 'mailto:support@medspace.co.za';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { login, token, loading: authLoading } = useSuperAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && token) {
      router.replace('/super-admin/dashboard');
    }
  }, [authLoading, token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    const { error: err } = await login(email, password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    router.push('/super-admin/dashboard');
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{
        background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 50%, #F0FDF4 100%)',
      }}
    >
      <div
        className={cn(
          'w-[90%] max-w-[420px] rounded-2xl border border-slate-200 bg-white',
          'p-8 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.01)]',
          'sm:p-12'
        )}
      >
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#14B8A6]">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              MedSpace Admin
            </span>
          </div>
          <p className="text-sm font-medium uppercase tracking-wide text-[#14B8A6]">
            Platform Administration
          </p>
          <h1 className="mt-2 text-[1.75rem] font-bold leading-tight text-slate-900">
            Platform Access
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Manage your healthcare practices across South Africa
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="owner@medspace.co.za"
                className={cn(
                  'h-11 border-slate-300 bg-white pl-10 text-base text-slate-900',
                  'placeholder:text-slate-400',
                  'focus-visible:border-[#14B8A6] focus-visible:ring-[#14B8A6]',
                  error && 'border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500'
                )}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={cn(
                  'h-11 border-slate-300 bg-white pl-10 pr-10 text-base text-slate-900',
                  'placeholder:text-slate-400',
                  'focus-visible:border-[#14B8A6] focus-visible:ring-[#14B8A6]',
                  error && 'border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Options row */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-slate-300 data-[state=checked]:border-[#14B8A6] data-[state=checked]:bg-[#14B8A6]"
              />
              <span className="text-sm text-slate-600">Remember me</span>
            </label>
            <a
              href={SUPPORT_MAIL}
              className="text-sm font-medium text-teal-600 transition-colors hover:text-teal-700"
            >
              Forgot password?
            </a>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className={cn(
              'h-12 w-full text-base font-semibold text-white transition-all duration-200',
              'bg-[#0F4C81] hover:bg-[#1E40AF] hover:shadow-md',
              'enabled:hover:-translate-y-px',
              'disabled:opacity-70'
            )}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In to Dashboard
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-8 space-y-3 border-t border-slate-100 pt-6 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" />
            Secure Connection • TLS 1.3
          </p>
          <p className="text-sm text-slate-500">
            Need help?{' '}
            <a
              href={SUPPORT_MAIL}
              className="font-medium text-slate-500 transition-colors hover:text-teal-600"
            >
              Contact support
            </a>
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <p className="text-xs text-slate-400">
              Demo: owner@ecdoctor.co.za / EasternCape@2026!
            </p>
          )}
          <Link
            href="/"
            className="inline-block text-xs text-slate-400 transition-colors hover:text-teal-600"
          >
            ← Back to MedSpace
          </Link>
        </div>
      </div>
    </div>
  );
}
