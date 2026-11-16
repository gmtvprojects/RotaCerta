import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// pasta do pacote astrixui (o Tailwind precisa ler as classes usadas pelos componentes dele)
const astrix = path.dirname(require.resolve('astrixui/package.json'));

/**
 * Tailwind só como motor das classes do astrixui e de utilitários pontuais: sem preflight (o reset global
 * continua sendo o styles.css) e com as cores do astrixui apontando para os tokens do RotaCerta.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', `${astrix}/components/**/*.js`],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      borderColor: { DEFAULT: 'var(--line)' },
      colors: {
        background: 'var(--bg)', foreground: 'var(--ink)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--ink)' },
        popover: { DEFAULT: 'var(--deep)', foreground: '#fff' },
        primary: { DEFAULT: 'var(--brand)', foreground: '#fff' },
        secondary: { DEFAULT: 'var(--sunk)', foreground: 'var(--ink)' },
        muted: { DEFAULT: 'var(--sunk)', foreground: 'var(--muted)' },
        accent: { DEFAULT: 'var(--brand-soft)', foreground: 'var(--ink)' },
        destructive: { DEFAULT: 'var(--red)', foreground: '#fff' },
        ring: 'var(--brand)', input: 'var(--line)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
