// The page script: src/main.tsx bundled to one ES module (app.js) and one
// style sheet (app.css). React and Three.js are not bundled: the page loads
// them from dist/vendor/ (React as its UMD build before app.js, Three.js as
// an ES module import), each with ?v=<stamp> so a new build is never mixed
// with cached files. build.sh passes the stamp in HS_STAMP.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const stamp = encodeURIComponent(process.env.HS_STAMP ?? 'dev');
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'react-dom/client': here('./src/shims/react-dom.ts'),
      react: here('./src/shims/react.ts'),
    },
  },
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
  build: {
    outDir: '../obj/web',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    lib: { entry: here('./src/main.tsx'), formats: ['es'], fileName: () => 'app.js' },
    rollupOptions: {
      external: ['three'],
      output: {
        paths: { three: `./vendor/three.module.min.js?v=${stamp}` },
        assetFileNames: 'app[extname]',
      },
    },
  },
});
