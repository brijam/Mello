/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mello: {
          blue: '#0079bf',
          'blue-dark': '#026aa7',
          green: '#519839',
          orange: '#d29034',
          red: '#b04632',
          purple: '#89609e',
          pink: '#cd5a91',
        },
      },
    },
  },
  plugins: [],
};
