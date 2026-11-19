// Bundle the extension host code for the VS Code Node host (CommonJS, vscode external).
// Mirrors the repo's esbuild-for-server pattern; the webview bundle (Phase 4) will
// be a separate Vite/esbuild target.
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
