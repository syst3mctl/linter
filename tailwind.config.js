/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // usectl palette
        bg: {
          DEFAULT: '#1e1d1d',
          card: '#0a0b10',
          soft: '#262525',
          softer: '#2e2d2d',
        },
        primary: {
          DEFAULT: '#11a32a',
          deep: '#0e8c24',
          soft: '#11a32a33', // 20% alpha
          softer: '#11a32a14', // 8%
          ring: '#11a32a66', // 40%
          glow: '#11a32aa1', // 63%
        },
        ink: {
          DEFAULT: '#ffffff',
          muted: '#ffffffcc', // 80%
          soft: '#ffffff94', // 58%
          dim: '#ffffff66',
          subtle: '#64748b',
        },
        line: {
          DEFAULT: '#64748833', // slate w/ 20%
          soft: '#64748822',
          green: '#11a32a66',
        },
        sev: {
          err: '#ff5f57',
          warn: '#febc2e',
          info: '#28c840',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '16px',
      },
      boxShadow: {
        'glow-green': '0 0 0 1px #11a32a66, 0 0 24px -4px #11a32a99',
      },
    },
  },
  plugins: [],
};
