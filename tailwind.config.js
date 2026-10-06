/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Newsreader', 'Times New Roman', 'Times', 'Georgia', 'serif'],
        serif: ['Newsreader', 'Times New Roman', 'Times', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Warm counterweight to the teal. Built out from #d68c56, the tone the
        // camera framing ring already used, so the accent isn't a new invention.
        clay: {
          50: '#fdf6f0',
          100: '#f9e8da',
          200: '#f2d0b5',
          300: '#e8b189',
          400: '#dd9c6c',
          500: '#d68c56',
          600: '#bf7340',
          700: '#9c5a34',
          800: '#7c4a2e',
          900: '#653e28',
        },
        // Deep desaturated teal for dark sections — reads as ink, not black.
        ink: {
          50: '#f2f7f6',
          100: '#dbe9e7',
          200: '#b7d3cf',
          300: '#8ab5b0',
          400: '#5b918c',
          500: '#3d726e',
          600: '#2c5a57',
          700: '#234846',
          800: '#1a3735',
          900: '#0d2321',
          950: '#061513',
        },
        cream: '#faf7f2',
      },
      boxShadow: {
        lift: '0 18px 40px -18px rgba(13, 35, 33, 0.28)',
        'lift-lg': '0 30px 70px -25px rgba(13, 35, 33, 0.38)',
        inset: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.6)',
      },
      backgroundImage: {
        'grid-ink':
          'linear-gradient(to right, rgba(13,35,33,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(13,35,33,0.055) 1px, transparent 1px)',
        'grid-light':
          'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '38px 38px',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.55' },
          '80%, 100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-ring': 'pulse-ring 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
}
