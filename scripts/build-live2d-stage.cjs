// Uses the esbuild that already ships with the project's Vite installation.
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const requireVite = createRequire(path.join(process.env.UNI_CLI_CONTEXT || path.join(root, 'web'), 'package.json'))
const esbuild = createRequire(requireVite.resolve('vite/package.json'))('esbuild')
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['server/src/web/live2d/runtime.ts'],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  // The framework includes shader and diagnostic strings with significant spaces.
  // Escaped JS string literals preserve them across Git newline normalization.
  supported: { 'template-literal': false },
  tsconfig: 'web/tsconfig.json',
  outfile: 'server/src/web/live2d/runtime.js',
  legalComments: 'none',
})
