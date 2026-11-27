import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// Firebase loads from Google's CDN (www.gstatic.com) instead of being bundled, which keeps
// ~130 KB per visit off Vercel. Same approach as the old tryouts page. The CDN version is
// taken from package.json, so the code we type-check against is the code that runs.
// To upgrade Firebase: change the version in package.json, `npm install`, rebuild.
const FIREBASE_VERSION = pkg.dependencies.firebase;
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const firebaseCdn: Record<string, string> = {
  'firebase/app': `${FIREBASE_CDN}/firebase-app.js`,
  'firebase/auth': `${FIREBASE_CDN}/firebase-auth.js`,
  'firebase/firestore': `${FIREBASE_CDN}/firebase-firestore.js`,
};

// One self-contained index.html (JS and CSS inlined), same build as the UNH Golf event page it came from.
// `npm run build` writes the live page to ../site/index.html (committed, served by Vercel).
// `npm run build:demo` writes a preview with example data and no Firebase.
export default defineConfig(({ mode }) => ({
  plugins: [preact(), viteSingleFile()],
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  build: {
    outDir: '../site',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    target: 'es2020',
    rollupOptions: {
      external: Object.keys(firebaseCdn),
      output: { paths: firebaseCdn },
    },
  },
}));
