/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        seereal: {
          bg: 'rgba(10, 10, 20, 0.85)',
          accent: '#FFD700', // Gold
          warning: '#FF6B00',
          danger: '#FF0055',
          neutral: '#FDE047', // Light Gold
        },
      },
      fontFamily: {
        header: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backdropBlur: {
        glass: '12px',
      },
      boxShadow: {
        neon: '0 0 20px rgba(255, 215, 0, 0.3)', // Gold shadow
        'neon-warning': '0 0 20px rgba(255, 107, 0, 0.3)',
        'neon-danger': '0 0 20px rgba(255, 0, 85, 0.3)',
      },
    },
  },
  plugins: [],
};
