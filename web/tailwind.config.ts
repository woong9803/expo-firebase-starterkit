import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Accent (Slate Blue) ──
        accent: '#3b5bdb',
        'accent-hover': '#2e4bc3',
        'accent-soft': '#eef2ff',

        // 앱 호환 alias
        primary: '#3b5bdb',
        'primary-dark': '#2e4bc3',
        'primary-light': '#eef2ff',
        'primary-mid': '#748ffc',

        // ── 배경 ──
        'page-bg': '#f6f7f9',
        'bg-surface': '#ffffff',
        'bg-subtle': '#f1f3f6',
        'bg-hover': '#eef1f5',

        // ── 사이드바 ──
        'sidebar-bg': '#0f1523',
        'sidebar-hover': '#1a2234',
        'sidebar-active': '#243049',
        'sidebar-border': '#1e2636',
        'sidebar-text': '#cbd5e1',
        'sidebar-muted': '#64748b',

        // ── 보더 ──
        border: '#e4e7ec',
        'border-strong': '#d0d5dd',

        // ── 텍스트 ──
        'text-main': '#0f172a',
        'text-sub': '#475569',
        'text-hint': '#94a3b8',
        'text-inverse': '#f8fafc',

        // ── 역할별 포인트 컬러 (앱과 동일) ──
        parent: '#F59E0B',
        student: '#10B981',

        // ── Semantic ──
        success: '#0ea371',
        'success-bg': '#e6f7ef',
        'success-text': '#065f46',
        warning: '#d97706',
        'warning-bg': '#fef3e0',
        'warning-text': '#78350f',
        danger: '#dc2626',
        'danger-bg': '#fee4e4',
        'danger-text': '#991b1b',
        info: '#0284c7',
        'info-bg': '#e0f2fe',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        card: '8px',
        input: '8px',
        chip: '6px',
        pill: '999px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(16,24,40,0.04)',
        sm: '0 1px 3px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.04)',
        md: '0 4px 8px -2px rgba(16,24,40,0.08), 0 2px 4px -2px rgba(16,24,40,0.04)',
        lg: '0 12px 20px -4px rgba(16,24,40,0.1), 0 4px 8px -2px rgba(16,24,40,0.06)',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'sans-serif',
        ],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px', letterSpacing: '0.04em' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        md: ['15px', { lineHeight: '23px' }],
        lg: ['17px', { lineHeight: '26px', letterSpacing: '-0.025em' }],
        xl: ['22px', { lineHeight: '30px', letterSpacing: '-0.025em' }],
        '2xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
      },
    },
  },
  plugins: [],
};

export default config;
