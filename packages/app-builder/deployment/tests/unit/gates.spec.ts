/**
 * Unit tests for the deterministic gate runners (`runSastGate`,
 * `runScaGate`, `runSecretsGate`, `runAllGates`). The tests cover each
 * pattern that blocks the deploy so the scanners' behavior is locked
 * against future pattern drift. The tests are deterministic: each test
 * creates a fresh `mkdtemp` project root, seeds the source files that
 * trip (or pass) the scanners, and asserts on the gate result.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runAllGates, runSastGate, runScaGate, runSecretsGate } from '../../src/gates.ts'

let projectRoot: string | undefined

afterEach(async () => {
  if (projectRoot !== undefined) await rm(projectRoot, { recursive: true, force: true })
  projectRoot = undefined
})

async function freshProjectRoot(): Promise<string> {
  projectRoot = await mkdtemp(join(tmpdir(), 'dsh-deployment-gate-'))
  return projectRoot
}

describe('runSastGate', () => {
  it('returns a passing result on a project without SAST patterns', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'index.ts'), 'export const hello = 1\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.kind).toBe('sast')
    expect(result.passed).toBe(true)
    expect(result.findings.length).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('flags eval() with an error-severity finding naming the file and line', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'eval.ts'), 'export const r = eval("1+1")\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings.length).toBeGreaterThanOrEqual(1)
    const f = result.findings[0]
    expect(f?.kind).toBe('sast')
    expect(f?.severity).toBe('error')
    expect(f?.file).toBe('eval.ts')
    expect(f?.line).toBe(1)
    expect(f?.message).toContain('eval')
  })

  it('flags new Function() with an error-severity finding', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'fn.ts'), 'const f = new Function("return 1")\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings.some(f => f.message.includes('new Function'))).toBe(true)
  })

  it('flags child_process.exec when invoked with a non-literal argument', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'cp.ts'), 'import { exec } from "node:child_process"\nexec(userInput)\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings.some(f => f.message.includes('child_process.exec'))).toBe(true)
  })

  it('does NOT flag child_process.exec when invoked with a literal argument', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'cp.ts'), 'import { exec } from "node:child_process"\nexec("ls")\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(true)
  })

  it('flags fs.unlinkSync with a non-literal path argument', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'rm.ts'), 'import { unlinkSync } from "node:fs"\nunlinkSync(userPath)\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings.some(f => f.message.includes('filesystem delete'))).toBe(true)
  })

  it('skips node_modules and .git directories', async () => {
    const root = await freshProjectRoot()
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'bad.ts'), 'eval("1")\n', 'utf8')
    await mkdir(join(root, '.git'), { recursive: true })
    await writeFile(join(root, '.git', 'config'), 'eval("1")\n', 'utf8')
    await writeFile(join(root, 'clean.ts'), 'export const x = 1\n', 'utf8')
    const result = await runSastGate(root)
    expect(result.passed).toBe(true)
  })

  it('ignores binary files (NUL byte in the first 8 KiB)', async () => {
    const root = await freshProjectRoot()
    // The .ts extension would normally be scanned; an embedded NUL byte
    // marks the file as binary and the walker skips it.
    await writeFile(join(root, 'binary.ts'), Buffer.from([0x00, 0x01, 0x02]))
    const result = await runSastGate(root)
    expect(result.passed).toBe(true)
  })
})

describe('runScaGate', () => {
  it('returns a passing result when package.json has no deny-listed dependencies', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'safe-pkg': '1.0.0' } }), 'utf8')
    const result = await runScaGate(root)
    expect(result.kind).toBe('sca')
    expect(result.passed).toBe(true)
  })

  it('flags a deny-listed dependency in any of the four dependency sections', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'flatmap-stream': '0.1.0' } }), 'utf8')
    const result = await runScaGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings[0]?.kind).toBe('sca')
    expect(result.findings[0]?.severity).toBe('error')
    expect(result.findings[0]?.message).toContain('flatmap-stream')
    expect(result.findings[0]?.file).toBe('package.json')
  })

  it('flags deny-listed dependencies in devDependencies', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ devDependencies: { 'event-stream': '4.0.0' } }), 'utf8')
    const result = await runScaGate(root)
    expect(result.passed).toBe(false)
  })

  it('emits a warn finding (still passing) when package.json is missing', async () => {
    const root = await freshProjectRoot()
    const result = await runScaGate(root)
    expect(result.passed).toBe(true)
    expect(result.findings[0]?.severity).toBe('warn')
    expect(result.findings[0]?.message).toContain('package.json')
  })

  it('emits a warn finding (still passing) when package.json is malformed JSON', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), '{not-json', 'utf8')
    const result = await runScaGate(root)
    expect(result.passed).toBe(true)
    expect(result.findings[0]?.severity).toBe('warn')
  })

  it('honours a custom deny-list override', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { 'foo-bar-malicious': '1.0.0' } }), 'utf8')
    const result = await runScaGate(root, new Set(['foo-bar-malicious']))
    expect(result.passed).toBe(false)
  })
})

describe('runSecretsGate', () => {
  it('returns a passing result on a project without secret patterns', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'config.ts'), 'export const region = "us-east-1"\n', 'utf8')
    const result = await runSecretsGate(root)
    expect(result.kind).toBe('secrets')
    expect(result.passed).toBe(true)
  })

  it('flags an AWS access key id', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, '.env'), 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n', 'utf8')
    const result = await runSecretsGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings[0]?.kind).toBe('secrets')
    expect(result.findings[0]?.message).toContain('AWS')
  })

  it('flags a GitHub personal access token', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, '.env'), 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n', 'utf8')
    const result = await runSecretsGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings[0]?.message).toContain('GitHub')
  })

  it('flags a PEM private key block', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'key.pem'), '-----BEGIN PRIVATE KEY-----\nMIIBVgIB\n-----END PRIVATE KEY-----\n', 'utf8')
    const result = await runSecretsGate(root)
    expect(result.passed).toBe(false)
    expect(result.findings[0]?.message).toContain('PEM')
  })
})

describe('runAllGates', () => {
  it('runs the three gates in canonical pipeline order', async () => {
    const root = await freshProjectRoot()
    const results = await runAllGates(root)
    expect(results.length).toBe(3)
    expect(results[0]?.kind).toBe('sast')
    expect(results[1]?.kind).toBe('sca')
    expect(results[2]?.kind).toBe('secrets')
  })

  it('returns one passed GateResult per gate on a clean project', async () => {
    const root = await freshProjectRoot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8')
    await writeFile(join(root, 'index.ts'), 'export const x = 1\n', 'utf8')
    const results = await runAllGates(root)
    for (const r of results) expect(r.passed).toBe(true)
  })
})
