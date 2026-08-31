/**
 * Deterministic gate runners for the App Builder deployment pipeline.
 *
 * Each gate is a pure function `(projectRoot) -> GateResult` that scans
 * the project's source tree without spawning subprocesses or making
 * network calls. The patterns are intentionally conservative: every
 * scanner reports what it sees verbatim, and the deploy short-circuits
 * when any `error`-severity finding is emitted.
 *
 * The three gate kinds:
 *
 *  - `sast`     - regex scan over JavaScript / TypeScript source files
 *                   for `eval(`, `new Function(`, `child_process.exec`
 *                   (without a literal argument), and direct `fs.unlinkSync`
 *                   on a path string. Each match is `error`-severity and
 *                   blocks the deploy.
 *  - `sca`      - `package.json` `dependencies` / `devDependencies`
 *                   lookup against a small bundled deny-list. A match is
 *                   `error`-severity and blocks the deploy.
 *  - `secrets`  - regex scan for AWS access-key ids, GitHub personal
 *                   access tokens, and PEM private-key blocks. Each match
 *                   is `error`-severity and blocks the deploy.
 *
 * The scanners operate on text content; binary files (anything that fails
 * the UTF-8 decode test) are skipped silently. The file walker descends
 * `node_modules` / `.git` / `dist` / `.next` / `.svelte-kit` / `.turbo`
 * once each - they never contribute to a deployable artifact - and never
 * follows symbolic links outside the project root.
 *
 * @module @deepseek-ai/dsh-app-builder-deployment/gates
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import type { GateFinding, GateKind, GateResult } from './types.ts'
import { GATE_KINDS } from './types.ts'

// ---------------------------------------------------------------------------
// File-walker primitives
// ---------------------------------------------------------------------------

/** Directory names the walker descends once and then stops. */
const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.svelte-kit',
  '.turbo',
  'coverage',
])

/** File extensions the SAST + secrets scanners inspect. */
const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.json', '.env', '.env.example', '.pem', '.key', '.crt',
  '.yml', '.yaml', '.md', '.txt', '.cfg', '.ini',
])

/** Dotfiles that the walker reads; everything else is skipped. */
const SCAN_DOTFILES: ReadonlySet<string> = new Set(['.env', '.env.example'])

/** Maximum file size the scanners will read; larger files are skipped. */
const MAX_SCAN_BYTES = 1048576

/**
 * Walk a project root, yielding every scannable file's project-relative path.
 * Symlinks are read with `fs.stat` (no follow) and skipped; the walker is
 * depth-first, breadth-stable, and never recurses into `SKIP_DIRECTORIES`.
 */
async function* walkProjectFiles(projectRoot: string): AsyncIterable<{ readonly relativePath: string; readonly absolutePath: string }> {
  const stack: string[] = [projectRoot]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const child = join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        stack.push(child)
        continue
      }
      if (!entry.isFile()) continue
      const baseName = entry.name
      const isDotfile = baseName.startsWith('.')
      if (isDotfile && !SCAN_DOTFILES.has(baseName)) continue
      const lastDot = baseName.lastIndexOf('.')
      const extension = lastDot === -1 ? '' : baseName.slice(lastDot).toLowerCase()
      if (!SCANNABLE_EXTENSIONS.has(extension)) continue
      yield { relativePath: relative(projectRoot, child).split(sep).join('/'), absolutePath: child }
    }
  }
}

/**
 * Read a file's text content if it is a regular file under the size cap.
 * Returns `undefined` for binary content, oversize files, or read errors;
 * the scanners treat `undefined` as 'skip' so a single unreadable file
 * never aborts the pipeline.
 */
async function readScannableFile(absolutePath: string): Promise<string | undefined> {
  let info: import('node:fs').Stats
  try {
    info = await stat(absolutePath)
  } catch {
    return undefined
  }
  if (!info.isFile() || info.size > MAX_SCAN_BYTES) return undefined
  let buffer: Buffer
  try {
    buffer = await readFile(absolutePath)
  } catch {
    return undefined
  }
  // Reject binary content: a NUL byte anywhere in the first 8 KiB signals
  // non-text. UTF-8 multi-byte sequences do not contain 0x00.
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192))
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) return undefined
  }
  return buffer.toString('utf8')
}

// ---------------------------------------------------------------------------
// SAST patterns
// ---------------------------------------------------------------------------

/**
 * JavaScript / TypeScript patterns the SAST scanner flags. Each entry is
 * `{ pattern, message }`; matches emit an `error`-severity finding.
 */
const SAST_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly message: string }> = [
  { pattern: /\beval\s*\(/, message: 'eval() executes arbitrary code at runtime.' },
  { pattern: /\bnew\s+Function\s*\(/, message: 'new Function() constructs an arbitrary function body at runtime.' },
  { pattern: /(?:child_process\.)?(?:exec|execSync)\s*\(\s*[^\s"'\x60]/, message: 'child_process.exec builds a shell command from runtime input.' },
  { pattern: /(?:fs\.)?(?:unlink|unlinkSync|rm|rmSync)\s*\(\s*([^\s"'\x60]+)\)/, message: 'filesystem delete with a non-literal path is unsafe to deploy.' },
]

// ---------------------------------------------------------------------------
// SCA deny-list
// ---------------------------------------------------------------------------

/**
 * Bundled package deny-list. Phase 2.1 keeps the list small and
 * deliberately names packages known to have been published with the same
 * name on multiple registries (typosquatting targets). Real deployments
 * should extend this list through the plugin's `denyList` config field.
 */
const DEFAULT_SCA_DENY_LIST: ReadonlySet<string> = new Set([
  'flatmap-stream',
  'flatmap-stream-test',
  'event-stream',
  'nodemailer-js',
])

// ---------------------------------------------------------------------------
// Secrets patterns
// ---------------------------------------------------------------------------

/**
 * Secret patterns the secrets scanner flags. Each entry is a regex with
 * an anchored, value-capturing form so the finding can carry the secret
 * substring for the operator to inspect.
 */
const SECRETS_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly message: string }> = [
  { pattern: /AKIA[0-9A-Z]{16}/, message: 'AWS access key id (AKIA...) is hard-coded.' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, message: 'GitHub personal access token (ghp_...) is hard-coded.' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, message: 'PEM private key is hard-coded.' },
]

// ---------------------------------------------------------------------------
// Scanner entry points
// ---------------------------------------------------------------------------

/**
 * Run a single regex pattern across one file's content, emitting one
 * finding per match with the 1-based line number. The pattern is cloned
 * with the global flag set so `matchAll` yields every occurrence.
 */
function scanContent(kind: GateKind, content: string, file: string, pattern: RegExp, message: string): GateFinding[] {
  const findings: GateFinding[] = []
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
  const re = new RegExp(pattern.source, flags)
  for (const match of content.matchAll(re)) {
    const index = match.index ?? 0
    const before = content.slice(0, index)
    const line = before.split(/\r?\n/).length
    findings.push({ kind, severity: 'error', message, file, line })
  }
  return findings
}

/**
 * Run the SAST gate over a project root. The scanner reads every
 * scannable file once and emits one `error`-severity finding per match;
 * warnings and info are not produced by this gate.
 */
export async function runSastGate(projectRoot: string): Promise<GateResult> {
  const started = Date.now()
  const findings: GateFinding[] = []
  for await (const file of walkProjectFiles(projectRoot)) {
    const content = await readScannableFile(file.absolutePath)
    if (content === undefined) continue
    for (const entry of SAST_PATTERNS) {
      findings.push(...scanContent('sast', content, file.relativePath, entry.pattern, entry.message))
    }
  }
  return { kind: 'sast', passed: findings.length === 0, findings, durationMs: Date.now() - started }
}

/**
 * Run the SCA gate over a project root. The scanner reads `package.json`
 * (when present) and checks `dependencies` / `devDependencies` /
 * `peerDependencies` / `optionalDependencies` against the deny-list.
 * Missing `package.json` yields a `warn`-severity finding and the gate
 * still passes; a matched package name emits an `error`-severity finding.
 */
export async function runScaGate(projectRoot: string, denyList: ReadonlySet<string> = DEFAULT_SCA_DENY_LIST): Promise<GateResult> {
  const started = Date.now()
  const findings: GateFinding[] = []
  const packageJsonPath = join(projectRoot, 'package.json')
  type PackageJsonDeps = {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  let packageJson: PackageJsonDeps
  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    packageJson = JSON.parse(raw) as typeof packageJson
  } catch {
    findings.push({
      kind: 'sca',
      severity: 'warn',
      message: 'package.json not found or unreadable; SCA gate has nothing to audit.',
      file: 'package.json',
    })
    return { kind: 'sca', passed: true, findings, durationMs: Date.now() - started }
  }
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
  for (const section of sections) {
    const deps = packageJson[section]
    if (deps === undefined) continue
    for (const name of Object.keys(deps)) {
      if (!denyList.has(name)) continue
      findings.push({
        kind: 'sca',
        severity: 'error',
        message: 'Dependency ' + section + '.' + name + ' is on the SCA deny-list.',
        file: 'package.json',
      })
    }
  }
  return { kind: 'sca', passed: findings.find(f => f.severity === 'error') === undefined, findings, durationMs: Date.now() - started }
}

/**
 * Run the secrets gate over a project root. The scanner reads every
 * scannable file once and emits one `error`-severity finding per match.
 */
export async function runSecretsGate(projectRoot: string): Promise<GateResult> {
  const started = Date.now()
  const findings: GateFinding[] = []
  for await (const file of walkProjectFiles(projectRoot)) {
    const content = await readScannableFile(file.absolutePath)
    if (content === undefined) continue
    for (const entry of SECRETS_PATTERNS) {
      findings.push(...scanContent('secrets', content, file.relativePath, entry.pattern, entry.message))
    }
  }
  return { kind: 'secrets', passed: findings.length === 0, findings, durationMs: Date.now() - started }
}

/**
 * Run every gate in canonical pipeline order. The result is an array of
 * `GateResult`s, one per `GATE_KINDS` entry, with `passed` derived
 * per-gate. The deploy short-circuits when any element has
 * `passed === false`.
 */
export async function runAllGates(
  projectRoot: string,
  options: { readonly denyList?: ReadonlySet<string> } = {},
): Promise<readonly GateResult[]> {
  const denyList = options.denyList ?? DEFAULT_SCA_DENY_LIST
  const results: GateResult[] = []
  for (const kind of GATE_KINDS) {
    if (kind === 'sast') {
      results.push(await runSastGate(projectRoot))
    } else if (kind === 'sca') {
      results.push(await runScaGate(projectRoot, denyList))
    } else {
      results.push(await runSecretsGate(projectRoot))
    }
  }
  return results
}
