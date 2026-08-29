/**
 * @module @deepseek-ai/dsh-app-builder-scaffold/templates
 *
 * Static project templates the scaffold tool writes verbatim into a fresh
 * project root. Each definition produces a working `npm install && npm run
 * dev` surface for its framework; the preview tool consumes the matching
 * `devCommand` to start the dev server.
 */

import type { ScaffoldTemplate, ScaffoldTemplateDefinition } from './types.ts'

const PACKAGE_NAME_NEXT_APP = JSON.stringify({
  name: 'app-builder-next-app',
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
  },
  dependencies: {
    next: 'latest',
    react: 'latest',
    'react-dom': 'latest',
  },
  devDependencies: {
    typescript: 'latest',
    '@types/node': 'latest',
    '@types/react': 'latest',
    '@types/react-dom': 'latest',
  },
})

const PACKAGE_NAME_NEXT_PAGES = JSON.stringify({
  name: 'app-builder-next-pages',
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
  },
  dependencies: {
    next: 'latest',
    react: 'latest',
    'react-dom': 'latest',
  },
  devDependencies: {
    typescript: 'latest',
    '@types/node': 'latest',
    '@types/react': 'latest',
    '@types/react-dom': 'latest',
  },
})

const PACKAGE_NAME_SVELTE_SPA = JSON.stringify({
  name: 'app-builder-svelte-spa',
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  devDependencies: {
    '@sveltejs/vite-plugin-svelte': 'latest',
    svelte: 'latest',
    typescript: 'latest',
    vite: 'latest',
  },
})

const TSCONFIG_BASE = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    lib: ['dom', 'dom.iterable', 'esnext'],
    allowJs: true,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: 'preserve',
    incremental: true,
  },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
  exclude: ['node_modules'],
}, null, 2)

/**
 * Each template is a closed set of files. Templates are immutable: the model
 * selects one and the tool writes the corresponding files verbatim. Template
 * paths are forward-slash relative paths and MUST NOT contain `..`.
 */
export const TEMPLATES: Readonly<Record<ScaffoldTemplate, ScaffoldTemplateDefinition>> = {
  'nextjs-app': {
    id: 'nextjs-app',
    label: 'Next.js (App Router)',
    installCommand: ['npm', 'install'],
    devCommand: ['npm', 'run', 'dev'],
    files: [
      { path: 'package.json', content: PACKAGE_NAME_NEXT_APP },
      { path: 'tsconfig.json', content: TSCONFIG_BASE },
      { path: 'next.config.js', content: "/** @type {import('next').NextConfig} */\nconst nextConfig = {}\nmodule.exports = nextConfig\n" },
      { path: 'app/layout.tsx', content: "export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang=\"en\">\n      <body>{children}</body>\n    </html>\n  )\n}\n" },
      { path: 'app/page.tsx', content: "export default function Home() {\n  return <main><h1>App Builder — hello, world</h1></main>\n}\n" },
    ],
  },
  'nextjs-pages': {
    id: 'nextjs-pages',
    label: 'Next.js (Pages Router)',
    installCommand: ['npm', 'install'],
    devCommand: ['npm', 'run', 'dev'],
    files: [
      { path: 'package.json', content: PACKAGE_NAME_NEXT_PAGES },
      { path: 'tsconfig.json', content: TSCONFIG_BASE },
      { path: 'next.config.js', content: "/** @type {import('next').NextConfig} */\nconst nextConfig = {}\nmodule.exports = nextConfig\n" },
      { path: 'pages/_app.tsx', content: "import type { AppProps } from 'next/app'\n\nexport default function App({ Component, pageProps }: AppProps) {\n  return <Component {...pageProps} />\n}\n" },
      { path: 'pages/index.tsx', content: "export default function Home() {\n  return <main><h1>App Builder — hello, world</h1></main>\n}\n" },
    ],
  },
  'svelte-spa': {
    id: 'svelte-spa',
    label: 'Svelte SPA (Vite)',
    installCommand: ['npm', 'install'],
    devCommand: ['npm', 'run', 'dev'],
    files: [
      { path: 'package.json', content: PACKAGE_NAME_SVELTE_SPA },
      { path: 'tsconfig.json', content: JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
          isolatedModules: true,
          verbatimModuleSyntax: true,
        },
        include: ['src/**/*.ts', 'src/**/*.svelte'],
      }, null, 2) },
      { path: 'vite.config.ts', content: "import { defineConfig } from 'vite'\nimport { svelte } from '@sveltejs/vite-plugin-svelte'\n\nexport default defineConfig({\n  plugins: [svelte()],\n})\n" },
      { path: 'index.html', content: "<!doctype html>\n<html lang=\"en\">\n  <head><meta charset=\"UTF-8\" /><title>App Builder</title></head>\n  <body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.ts\"></script></body>\n</html>\n" },
      { path: 'src/main.ts', content: "import App from './App.svelte'\nimport './app.css'\n\nconst app = new App({ target: document.getElementById('app')! })\n\nexport default app\n" },
      { path: 'src/app.css', content: "body { font-family: system-ui, sans-serif; margin: 2rem; }\n" },
      { path: 'src/App.svelte', content: "<script lang=\"ts\">\n  let name = 'world'\n</script>\n\n<main>\n  <h1>App Builder — hello, {name}</h1>\n</main>\n" },
    ],
  },
}
