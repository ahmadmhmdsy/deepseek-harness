# Step 12 — Build, test, hygiene, and CI gates

> Status: COMPLETE. Phase alignment: every new App Builder plugin must satisfy the existing gates. This step enumerates them.

## Headline finding

dsh has a mature, multi-tier testing and verification system. App Builder's new packages must satisfy all of it or `pnpm run hygiene` / `pnpm run test:coverage` / `pnpm run typecheck` will fail. The plan underestimates this load.

## Tiers (per docs/testing.md)

| Tier | Command | Coverage | When |
|---|---|---|---|
| Unit | `pnpm run test` | vitest over `tests/**` + `scripts/**/*.spec.ts`; HMR-safety tests for registries | Every PR |
| Coverage gate | `pnpm run test:coverage` | per-file 100% on `packages/*/*/src`; uncovered lines often = dead code | CI |
| Real-API e2e | `pnpm run test:e2e` | against live provider APIs; self-skips without keys | Local with `DEEPSEEK_API_KEY`; CI with key |
| Snapshot | `pnpm run test:snapshot` | keyless expected outputs: transport contracts, presentation, persisted logs (ACP + headless) | Local + CI |
| Web browser snapshot | `pnpm run test:web` | Chromium compares replayed browser output with `apps/web/tests/snapshots/`; CI forces `DSH_SNAPSHOT=replay` | Linux PR gate |
| Doc sync | `pnpm run doc-sync` | all documentation gates | Local + CI |
| Hygiene | `pnpm run hygiene` | knip + publint + workspace constraints + NodeNext consumer check | Local + CI |
| Typecheck | `pnpm run typecheck` | `tsc -b tsconfig.client.json` after host build | Local + CI |
| Build | `pnpm run build` | `scripts/build.ts`; emits lib/types + tsdown bundles | Local + CI |

## Test counts (rough)

- `packages/*/tests/` directories: ~225
- Test files inside packages: counted as 0 by `Get-ChildItem -Include '*.test.ts'` — confirms dsh uses `*.spec.ts` (the policy-named convention) rather than `*.test.ts`.

## Existing mechanical verifiers (must-pass for new packages)

From root `package.json` scripts and `scripts/`:

- `verify-export-jsdoc` — JSDoc on every export.
- `verify-package-invariants` — runtime invariants registered per package.
- `verify-built-package-invariants` — `lib/` invariants.
- `verify-md-wrap` / `verify-md-links` / `verify-doc-refs` — doc hygiene.
- `verify-package-paths` / `verify-dsh-package-licenses` — package layout.
- `verify-doc-budgets` / `verify-doc-site-fragments` — website gating.
- `verify-runtime-closure` — bundle closure.
- `verify-client-packages` — browser-side closure.
- `verify-vendored-links` — vendored dep linkage.
- `verify-cordis-config` — raw/Web `cordis.yml` bare plugins must appear in resolver manifest's `dependencies`.
- `verify-cordis-catalog` / `verify-client-catalog` / `verify-tool-catalog` / `verify-config-catalog` / `verify-persistence-catalog` / `verify-doc-graphs` / `verify-module-graph` / `verify-scoped-events` — generated catalog checkers.
- `verify-optional-dependency-imports` / `verify-node-next-types`.
- `verify-public-repository-links`.
- `verify-package-readme-limitations` / `verify-package-readme-model-experience`.
- `verify-mermaid`.
- `verify-agent-note-classification` / `verify-agent-note-format` / `verify-archived-agent-notes`.
- `verify-type-equiv`.
- `verify-skill-invocation-metadata`.
- `verify-translation-prompt` / `verify-translation-pairing` / `resolve-translation-pairing-conflicts`.
- `verify-package-invariants` / `verify-built-package-invariants`.
- `verify-config-source-ownership`.
- `verify-runtime-closure`.
- `verify-client-domain-graph`.

## Policy rules (per AGENTS.md)

- **Real-composition tests for product-visible plugins.** Hand-built `ctx.plugin(...)` suites are insufficient; must boot test-only `cordis.yml` through Loader and app/process.
- **Source plane vs artifact plane, never mixed.** Static gates and tests resolve workspace imports through tsconfig `paths` to `src` and pass on a clean tree; gates consuming built `lib/` declare that dependency.
- **Two TS faces (host + client).** Each package uses one aggregate except `api/remotes`; repo-wide programs seed a face config, never the root solution.
- **Per-package invariant companion.** Every package owns `./invariant`; registers the manifest name; checks an event/data relation or gives empty installers a `No runtime invariant:` reason.
- **Trusted same-process boundaries.** No runtime validation/fallback for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries.
- **Per-file 100% coverage on `packages/*/*/src`.** Uncovered lines are dead code; gate is correct to flag.
- **Snapshot tests for every non-trivial model- or product-user-visible change.** Must run via a real runnable example in the same PR; package tests do not substitute.
- **Agent Note required for non-trivial changes.** Only mechanical/local edits are exempt.
- **Bilingual docs follow the i18n pairing contract.** `verify-doc-refs` and `verify-doc-budgets` enforce.
- **Plugin export shapes.** Services default-export a class; function plugins named-export `name` / `inject` / `Config` / `apply` and have no default export.

## Build pipeline (scripts/build.ts)

- `pnpm run build` invokes `tsx scripts/build.ts`. Output: `lib/` (tsc emit) + bundled tsdown artifacts.
- Two faces: `build:lib:host` (`tsconfig.host.json` + `tsdown --env.DSH_BUILD_FACE host`) and `build:lib:client` (`tsconfig.client.json` + `tsdown --env.DSH_BUILD_FACE client`).
- `--profile official` produces official-release bundle.
- `pnpm run build:web` rebuilds `apps/web` dist (consumed by `dsh web`).
- `pnpm run clean` removes build outputs and safe residue from deleted packages.

## CI matrix (from `scripts/run-gates.ts`)

- `check:ci:linux-primary` — Linux primary gates.
- `check:ci:windows-blocking` / `check:ci:windows-complete` / `check:ci:windows-observational` — Windows tiers (blocking + complete + observational).
- `check:ci:lint:contracts-ready` — oxlint over `packages/*/*/src`.
- `check:ci:coverage` — coverage gate.
- `check:ci:snapshot` — snapshot gate.
- `check:ci:artifacts` — build artifacts.
- `check:ci:consumers` — NodeNext consumer check.
- `check:ci:static` — static analysis.

## Plan implications

Every new package and every new tool requires:

1. A `tests/` directory (NOT `src/__tests__/`).
2. A `src/invariant.ts` exporting `@deepseek-ai/dsh-<name>/invariant`.
3. README + JSDoc updated together (Model Experience section + Known Limitations section).
4. Real-composition test (boot a test-only `cordis.yml` through Loader).
5. Catalog registration (cordis, client, tool, config, persistence).
6. If model-facing, a snapshot test.
7. If web UI visible, a browser snapshot test.
8. An Agent Note if non-trivial.
9. Bilingual docs (zh.md + i18n.yaml).
10. Per-file 100% coverage on `src`.

## Plan mismatches identified (carried to Step 14)

- Plan estimates phases by user-visible milestones but does not name the gate load. Each milestone = at least one new package = full gate cycle.
- Plan does not name `verify-cordis-config` (raw/Web cordis.yml bare plugins must appear in resolver manifest's `dependencies`). New cordis.yml composition must be paired with its package.json.
- Plan does not name the dual-face build (`tsconfig.host.json` + `tsconfig.client.json`). App Builder browser-vs-server split must respect this.
- Plan does not name per-package invariant companions. New packages must ship `./invariant`.
- Plan does not name the bilingual doc pairing contract. App Builder docs must be bilingual.
- Plan does not name that 'real composition test' means boot a test-only `cordis.yml` through Loader — not a unit-style mock. Heavy cost for new plugin authors.
- Plan does not name the snapshot-test requirement for non-trivial model- or product-visible changes. The 'hello world' will need a snapshot.
- Plan does not name the Agent-Note requirement for non-trivial changes. Every meaningful PR ships one.
- Plan does not name the website gating (`verify-doc-site-fragments`). Adding/changing user-facing docs that project to the website gates the change.
- Plan does not name `verify-export-jsdoc` — every export needs JSDoc.
