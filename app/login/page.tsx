'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Loader2, Globe } from 'lucide-react';
import { RebuilDLogo } from '@/components/ui/RebuilDLogo';
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from '@/store/usePulseStore.new';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t, locale } = useTranslation();
  const setLocale = usePulseStore((s) => s.setLocale);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError(locale === 'zh' ? '邮箱或密码错误' : 'Invalid email or password');
    } else {
      router.push('/');
    }
  }

  const toggleLocale = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="w-full max-w-[400px] px-6 relative">
      {/* Language toggle — top right corner */}
      <button
        onClick={toggleLocale}
        className="fixed top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--border-subtle)] transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        {locale === 'zh' ? 'English' : '中文'}
      </button>

      {/* Brand */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-lg bg-zinc-200 flex items-center justify-center">
          <RebuilDLogo className="w-5 h-5 text-black" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          RebuilD
        </h1>
      </div>

      {/* Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              {locale === 'zh' ? '邮箱' : 'Email'}
            </label>
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--text-muted)] transition-colors"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              {locale === 'zh' ? '密码' : 'Password'}
            </label>
            <input
              type="password"
              placeholder={locale === 'zh' ? '输入密码' : 'Enter your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--text-muted)] transition-colors"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Register hint */}
          <p className="text-left text-xs text-[var(--text-muted)]">
            {locale === 'zh' ? '没有账号？' : "Don't have an account? "}
            <a href="/register" className="text-[var(--accent)] hover:underline">
              {locale === 'zh' ? '注册一下' : 'Sign Up'}
            </a>
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {locale === 'zh' ? '登录中...' : 'Signing in...'}
              </>
            ) : (
              locale === 'zh' ? '登录' : 'Sign In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
          <span className="text-xs text-[var(--text-disabled)]">
            {locale === 'zh' ? '或通过以下方式' : 'or continue with'}
          </span>
          <div className="flex-1 h-px bg-[var(--border-subtle)]" />
        </div>

        {/* SSO buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => signIn('feishu')}
            className="flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/feishu.png" alt="Feishu" className="w-5 h-5 invert" />
            {locale === 'zh' ? '飞书' : 'Feishu'}
          </button>
          <button
            onClick={() => signIn('wecom')}
            className="flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            {/* WeCom icon — chat bubble with molecular connector */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.5 3C6.36 3 3 6.13 3 9.95c0 2.17 1.1 4.1 2.82 5.37l-.71 2.12a.5.5 0 0 0 .71.58l2.5-1.3c.69.2 1.42.3 2.18.3.37 0 .74-.03 1.1-.08a5.96 5.96 0 0 1-.1-1.09c0-3.53 3.13-6.4 7-6.4.34 0 .67.02 1 .07C19.5 5.87 15.45 3 10.5 3Z" />
              <path d="M18.5 11.35c-2.9 0-5.25 2.02-5.25 4.52 0 2.5 2.35 4.53 5.25 4.53.55 0 1.08-.07 1.58-.2l1.72.9a.35.35 0 0 0 .5-.41l-.49-1.46c1.15-.88 1.94-2.18 1.94-3.65 0-2.3-2.35-4.23-5.25-4.23Z" />
              <circle cx="16.2" cy="15.87" r=".85" />
              <circle cx="18.5" cy="14.1" r=".85" />
              <circle cx="20.8" cy="15.87" r=".85" />
              <line x1="16.8" y1="15.5" x2="18" y2="14.5" stroke="currentColor" strokeWidth=".6" />
              <line x1="19" y1="14.5" x2="20.2" y2="15.5" stroke="currentColor" strokeWidth=".6" />
            </svg>
            {locale === 'zh' ? '企业微信' : 'WeCom'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-[var(--text-disabled)] mt-6">
        {locale === 'zh' ? '继续即表示您同意服务条款' : 'By continuing, you agree to the Terms of Service'}
      </p>
    </div>
  );
}
