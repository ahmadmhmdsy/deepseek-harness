/**
 * Unit tests for the App Builder preview tool. These cover the pure
 * validators, the framework detection, the dev command construction, and
 * the readiness helper abort behavior. The full end-to-end composition
 * (start dev server + readiness probe) lives in `examples/app-builder/tests/e2e/`
 * once the bundle is mounted; this spec keeps the package self-contained.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'vitest'
import { detectFramework, buildDevCommand } from '../src/index.ts'
import { validateFramework, validatePollIntervalMs, validatePort, validateReadyTimeoutMs, validateRootPath } from '../src/validate.ts'
import { awaitReadiness, probeOnce } from '../src/readiness.ts'

describe('app-builder-preview (validators)', () => {
  describe('validateRootPath', () => {
    it('accepts undefined for the default session cwd', () => {
      assert.equal(validateRootPath(undefined), undefined)
    })
    it('accepts a non-empty path string', () => {
      assert.equal(validateRootPath('./apps/web'), './apps/web')
    })
    it('rejects an empty string', () => {
      assert.throws(() => validateRootPath(''), /non-empty path string/)
    })
    it('rejects a non-string value', () => {
      assert.throws(() => validateRootPath(42), /non-empty path string/)
    })
    it('rejects control characters', () => {
      assert.throws(() => validateRootPath('foo\u0000bar'), /non-empty path string/)
    })
  })

  describe('validatePort', () => {
    it('accepts a valid integer in the unprivileged range', () => {
      assert.equal(validatePort(3000), 3000)
    })
    it('accepts 1 and 65535 as bounds', () => {
      assert.equal(validatePort(1), 1)
      assert.equal(validatePort(65535), 65535)
    })
    it('rejects 0 and 65536', () => {
      assert.throws(() => validatePort(0), /integer in 1\.\.65535/)
      assert.throws(() => validatePort(65536), /integer in 1\.\.65535/)
    })
    it('rejects a non-integer and a non-number', () => {
      assert.throws(() => validatePort(3.14), /integer in 1\.\.65535/)
      assert.throws(() => validatePort('3000'), /integer in 1\.\.65535/)
    })
  })

  describe('validateReadyTimeoutMs', () => {
    it('accepts a positive finite number', () => {
      assert.equal(validateReadyTimeoutMs(30_000), 30_000)
    })
    it('rejects 0, negative, and non-finite values', () => {
      assert.throws(() => validateReadyTimeoutMs(0), /positive number/)
      assert.throws(() => validateReadyTimeoutMs(-1), /positive number/)
      assert.throws(() => validateReadyTimeoutMs(NaN), /positive number/)
    })
    it('rejects values above the 10-minute cap', () => {
      assert.throws(() => validateReadyTimeoutMs(600_001), /exceeds the 600000 ms cap/)
    })
  })

  describe('validatePollIntervalMs', () => {
    it('accepts a positive integer in 1..5000', () => {
      assert.equal(validatePollIntervalMs(250), 250)
    })
    it('rejects 0 and 5001', () => {
      assert.throws(() => validatePollIntervalMs(0), /integer in 1\.\.5000/)
      assert.throws(() => validatePollIntervalMs(5001), /integer in 1\.\.5000/)
    })
    it('rejects non-integer values', () => {
      assert.throws(() => validatePollIntervalMs(250.5), /integer in 1\.\.5000/)
    })
  })

  describe('validateFramework', () => {
    it('accepts the three known frameworks', () => {
      assert.equal(validateFramework('next'), 'next')
      assert.equal(validateFramework('vite'), 'vite')
      assert.equal(validateFramework('unknown'), 'unknown')
    })
    it('rejects unrecognised values', () => {
      assert.throws(() => validateFramework('sveltekit'), /expected/)
    })
  })
})

describe('app-builder-preview (detection)', () => {
  describe('detectFramework', () => {
    it('detects next from the dev script', () => {
      assert.equal(detectFramework({ scripts: { dev: 'next dev' } }), 'next')
    })
    it('detects next from the dependency when the script is generic', () => {
      assert.equal(detectFramework({ dependencies: { next: '15.0.0' } }), 'next')
    })
    it('detects vite from the dev script', () => {
      assert.equal(detectFramework({ scripts: { dev: 'vite' } }), 'vite')
    })
    it('detects vite from the dependency', () => {
      assert.equal(detectFramework({ devDependencies: { vite: '5.0.0' } }), 'vite')
    })
    it('falls back to unknown when neither framework is present', () => {
      assert.equal(detectFramework({ scripts: { dev: 'node server.js' } }), 'unknown')
    })
  })

  describe('buildDevCommand', () => {
    it('uses -p for next and prepends a JSON-quoted cd', () => {
      const cmd = buildDevCommand('next', '/tmp/app', 3000)
      assert.match(cmd, /^cd "\/tmp\/app" &&/)
      assert.match(cmd, /npm exec -- next dev -p 3000$/)
    })
    it('uses --port for vite', () => {
      const cmd = buildDevCommand('vite', '/tmp/app', 5173)
      assert.match(cmd, /npm exec -- vite --port 5173$/)
    })
    it('falls back to npm run dev for unknown frameworks', () => {
      const cmd = buildDevCommand('unknown', '/tmp/app', 8080)
      assert.match(cmd, /npm run dev$/)
    })
  })
})

describe('app-builder-preview (readiness)', () => {
  describe('probeOnce', () => {
    it('reports not connected when nothing listens on the port', async () => {
      // Port 1 is reserved + unbound; fetch should reject without a 200.
      const attempt = await probeOnce('http://127.0.0.1:1/', new AbortController().signal)
      assert.equal(attempt.connected, false)
    })
    it('honours an already-aborted signal', async () => {
      const controller = new AbortController()
      controller.abort()
      const attempt = await probeOnce('http://127.0.0.1:65535/', controller.signal)
      assert.equal(attempt.connected, false)
      assert.ok(attempt.error !== undefined)
    })
  })

  describe('awaitReadiness', () => {
    it('returns ready=false when the budget elapses', async () => {
      const start = Date.now()
      const result = await awaitReadiness({
        host: '127.0.0.1',
        port: 1,
        timeoutMs: 500,
        pollIntervalMs: 100,
        signal: new AbortController().signal,
      })
      assert.equal(result.ready, false)
      assert.ok(result.polls >= 1)
      assert.ok(Date.now() - start < 2000)
    })
    it('throws when the outer signal aborts before timeout', async () => {
      const controller = new AbortController()
      const promise = awaitReadiness({
        host: '127.0.0.1',
        port: 1,
        timeoutMs: 5_000,
        pollIntervalMs: 100,
        signal: controller.signal,
      })
      setTimeout(() => controller.abort(), 50)
      await assert.rejects(promise, /readiness probe aborted/)
    })
  })
})
