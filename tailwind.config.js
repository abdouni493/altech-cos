/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Altech POS palette — ink navy · electric blue · cyan, amber accent.
        // (Token group kept as "wood" so every existing utility class picks up
        // the new identity app-wide.)
        wood: {
          dark: '#0B1324', // ink navy — headings, strong text
          medium: '#56627A', // slate — secondary text (AA on white)
          warm: '#2F5BFF', // electric blue — primary
          light: '#8EA6FF', // soft blue — icons, borders (with alpha)
          blonde: '#C9D6FF', // pale blue
          cream: '#EEF2FB', // light surface
          white: '#F7F9FD', // app background tint
        },
        gold: {
          DEFAULT: '#F5A524', // amber accent — highlights, "partial" states
          light: '#FFD27A',
        },
        aqua: '#00B8D9', // cyan accent of the brand gradient
        sage: '#12B76A', // success — paid, sale price, in stock
        terracotta: '#F04438', // danger — debt, alerts, delete
        charcoal: '#1B2333', // body text
      },
      fontFamily: {
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Cairo', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', '"JetBrains Mono"', 'monospace'],
        arabic: ['Cairo', '"Segoe UI"', 'sans-serif'],
      },
      backgroundImage: {
        'wood-sidebar': 'linear-gradient(180deg, #0B1324 0%, #101B34 55%, #0E2552 100%)',
        'wood-header': 'linear-gradient(115deg, #1C3FE0 0%, #2F5BFF 48%, #00B8D9 100%)',
        'wood-btn': 'linear-gradient(135deg, #3D67FF 0%, #2448F0 100%)',
        'wood-bg':
          'radial-gradient(1200px 600px at 100% -10%, rgba(47,91,255,0.07), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(0,184,217,0.06), transparent 60%), #F4F6FB',
        'wood-card': 'linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)',
        'gold-shine': 'linear-gradient(135deg, #F5A524 0%, #FFC24D 100%)',
        'rose-shine': 'linear-gradient(135deg, #2F5BFF 0%, #00B8D9 100%)',
      },
      boxShadow: {
        wood: '0 1px 2px rgba(16, 24, 40, 0.05), 0 2px 6px -2px rgba(16, 24, 40, 0.08)',
        'wood-lg': '0 24px 48px -12px rgba(11, 19, 36, 0.28)',
        'wood-inset': 'inset 0 1px 0 rgba(255,255,255,0.12)',
        gold: '0 6px 16px -4px rgba(245, 165, 36, 0.5)',
        rose: '0 8px 22px -6px rgba(47, 91, 255, 0.55)',
      },
      borderColor: {
        woodborder: '#E4E8F1',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        bloom: {
          '0%': { transform: 'scale(0.96)', opacity: '0.75' },
          '50%': { transform: 'scale(1.02)', opacity: '1' },
          '100%': { transform: 'scale(0.96)', opacity: '0.75' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(240, 68, 56, 0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgba(240, 68, 56, 0)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        scan: {
          '0%, 100%': { transform: 'translateY(-14px)', opacity: '0.4' },
          '50%': { transform: 'translateY(14px)', opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 6s ease-in-out infinite',
        bloom: 'bloom 3s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        scan: 'scan 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
