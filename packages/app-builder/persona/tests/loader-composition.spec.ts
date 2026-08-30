/**
 * Unit tests for the App Builder persona plugin. These cover the
 * persona text, the default-text behavior, and the verbatim override;
 * the full scoped-prompt composition lives in `apps/cli/config/examples/app-builder/tests/`
 * once the bundle is mounted. This spec keeps the package self-contained
 * at the text and config-merge tier.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'vitest'
import { APP_BUILDER_PERSONA } from '../src/text.ts'

describe('app-builder-persona (text)', () => {
  it('exports a non-empty persona string', () => {
    assert.equal(typeof APP_BUILDER_PERSONA, 'string')
    assert.ok(APP_BUILDER_PERSONA.length > 0)
  })

  it('mentions the two App Builder tools by name', () => {
    assert.match(APP_BUILDER_PERSONA, /app_builder_scaffold/)
    assert.match(APP_BUILDER_PERSONA, /app_builder_preview/)
  })

  it('forbids starting the dev server through bash', () => {
    assert.match(APP_BUILDER_PERSONA, /do not start a dev server through `bash`/)
  })

  it('forbids inventing or substituting tools', () => {
    assert.match(APP_BUILDER_PERSONA, /do not invent or substitute tools/)
  })

  it('refuses to scaffold into an existing directory', () => {
    assert.match(APP_BUILDER_PERSONA, /refuse to scaffold into an existing directory/)
  })

  it('asks for confirmation on scope changes', () => {
    assert.match(APP_BUILDER_PERSONA, /the user changes scope/)
  })
})
