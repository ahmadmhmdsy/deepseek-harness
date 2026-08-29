/**
 * Validator unit tests for the App Builder scaffold plugin. These cover the
 * model-supplied-input boundary before any capability call: a malformed name
 * or path never reaches `ctx.fs`, so the surface area is small but failure
 * here means a model can escape the sandbox policy.
 *
 * The full end-to-end composition (write files + run `npm install`) lives in
 * `examples/app-builder/tests/e2e/` once the bundle is mounted; this spec
 * keeps the package self-contained at the validator tier.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'vitest'
import { TEMPLATES } from '../src/templates.ts'
import { validateProjectName, validateTemplatePath } from '../src/validate.ts'

describe('app-builder-scaffold (validators)', () => {
  describe('validateProjectName', () => {
    it('accepts a plain directory name', () => {
      assert.doesNotThrow(() => validateProjectName('my-app'))
    })

    it('rejects an empty name', () => {
      assert.throws(() => validateProjectName(''), /non-empty string/)
      assert.throws(() => validateProjectName('   '), /non-empty string/)
    })

    it('rejects path separators', () => {
      assert.throws(() => validateProjectName('foo/bar'), /path separators/)
      assert.throws(() => validateProjectName('foo\\bar'), /path separators/)
    })

    it("rejects '.' and '..'", () => {
      assert.throws(() => validateProjectName('.'), /must not contain path separators/)
      assert.throws(() => validateProjectName('..'), /must not contain path separators/)
    })

    it('rejects control characters', () => {
      assert.throws(() => validateProjectName('foo\u0000bar'), /control characters/)
      assert.throws(() => validateProjectName('foo\u0007bar'), /control characters/)
    })
  })

  describe('validateTemplatePath', () => {
    it('accepts a forward-slash relative path', () => {
      assert.doesNotThrow(() => validateTemplatePath('app/page.tsx'))
    })

    it('accepts a flat file path', () => {
      assert.doesNotThrow(() => validateTemplatePath('package.json'))
    })

    it("rejects '.' and '..' segments", () => {
      assert.throws(() => validateTemplatePath('./escape'), /'\.' or '\.\.'/)
      assert.throws(() => validateTemplatePath('../escape'), /'\.' or '\.\.'/)
      assert.throws(() => validateTemplatePath('app/../../escape'), /'\.' or '\.\.'/)
    })
  })

  describe('TEMPLATES catalog', () => {
    it('covers every ScaffoldTemplate id', () => {
      assert.ok(TEMPLATES['nextjs-app'], 'nextjs-app template is defined')
      assert.ok(TEMPLATES['nextjs-pages'], 'nextjs-pages template is defined')
      assert.ok(TEMPLATES['svelte-spa'], 'svelte-spa template is defined')
    })

    it('declares a package.json with a scripts.dev entry per template', () => {
      for (const def of Object.values(TEMPLATES)) {
        const pkg = def.files.find(f => f.path === 'package.json')
        assert.ok(pkg, `${def.id}: package.json present`)
        const parsed = JSON.parse(pkg!.content) as { scripts?: Record<string, string> }
        assert.ok(parsed.scripts?.dev, `${def.id}: scripts.dev is set`)
      }
    })

    it('declares paths that all pass validateTemplatePath', () => {
      for (const def of Object.values(TEMPLATES)) {
        for (const file of def.files) {
          assert.doesNotThrow(
            () => validateTemplatePath(file.path),
            `${def.id}: ${file.path} must pass validateTemplatePath`,
          )
        }
      }
    })
  })
})
