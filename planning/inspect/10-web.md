# Step 10 — Web capabilities: search/fetch providers (with redirect audit)

> Status: COMPLETE. Phase alignment: search/fetch for the App Builder's agent + redirect-policy audit per packages/web/AGENTS.md.

## Headline finding

All three credentialed web search providers set `redirect: 'error'` on their fetch calls — the target Location header is NEVER contacted. The anonymous fetch provider correctly uses `redirect: 'manual'` and follows only same-origin redirects. The packages/web/AGENTS.md rule ('reject redirects on credential-bearing provider requests') is satisfied across the codebase.

## Audit table (verbatim source evidence)

| Provider | Credentials? | `redirect:` value | Verdict | Source |
|---|---|---|---|---|
| `web-search-deepseek` | YES (DEEPSEEK_API_KEY, sent as both `x-api-key` and `authorization: Bearer`) | `'error'` | PASS — target Location never contacted | `packages/web/web-search-deepseek/src/provider.ts`, fetch call uses `redirect: 'error'` |
| `web-search-perplexity` | YES (PERPLEXITY_API_KEY, sent as `authorization: Bearer`) | `'error'` | PASS — target Location never contacted | `packages/web/web-search-perplexity/src/provider.ts` |
| `web-search-exa` | YES (EXA_API_KEY, sent as `authorization: Bearer`) | `'error'` | PASS — target Location never contacted | `packages/web/web-search-exa/src/provider.ts` |
| `web-fetch-http` | NO (anonymous public fetcher; explicit product User-Agent; no cookies; no ambient credentials) | `'manual'` with same-origin redirect limit (default 5) | PASS — anonymous fetcher may follow same-origin redirects; cross-origin redirects fail `WEB_REDIRECT_BLOCKED` | `packages/web/web-fetch-http/src/provider.ts` |

## Provider detail

### `web-search-deepseek` — DeepSeek Messages API

- Endpoint: `${baseURL}/messages` where baseURL defaults to `https://api.deepseek.com/anthropic/v1`.
- Sends BOTH `x-api-key` and `authorization: Bearer` headers so either DeepSeek native or an Anthropic-compatible proxy resolves the credential.
- Calls Anthropic-format `web_search_20250305` server tool; `max_uses` config defaults to 5.
- **Strict mode**: if the response carries no `web_search_tool_result` block, throws `WebError('WEB_PROVIDER_ERROR')` rather than degrading to prose-scraping.
- Records the exact secret-free request via `recordRequest` so model-visible auxiliary input cannot escape logging.
- `apiKeyEnv` defaults to `DEEPSEEK_API_KEY` (separate from `$DEEPSEEK_BASE_URL`, which belongs to chat-completions).

### `web-search-perplexity` — Perplexity OpenAI-compatible

- Endpoint: `${baseURL}/chat/completions` where baseURL defaults to `https://api.perplexity.ai`.
- Default model `sonar`; `max_tokens` default 1024; optional `search_recency_filter` (`day`/`week`/`month`/`year`).
- Maps structured `search_results[]` to normalized sources; falls back to URL-only `citations[]` only when `search_results` is absent (those sources carry just `url` — `title`/`snippet`/`publishedAt` are optional on the seam).

### `web-search-exa` — Exa

- Endpoint: `${baseURL}/search` where baseURL defaults to `https://api.exa.ai`.
- Default retrieval mode `auto`; `highlightsPerUrl` default 1.
- Maps `highlights[0]` to `snippet`; drops results with no non-blank highlight ('the seam has no other field to derive a snippet from, and inventing one would lie').
- Returns no `content` (Exa returns no generated answer).

### `web-fetch-http` — anonymous public HTTP(S)

- Per-step transport limits: `maxUrlLength` 2048, `maxResponseBytes` 5 MiB, `maxBodyChars` 100k, `timeoutMs` 30 s, `maxRedirects` 5, `userAgent` 'deepseek-harness/0.0.1'.
- `redirect: 'manual'`; the provider explicitly follows same-origin redirects only. Cross-origin redirects fail with `WEB_REDIRECT_BLOCKED` ('retry against that URL directly').
- Re-validates each redirect target against the same `validateFetchUrl` a direct request gets, so a redirect cannot be a back door to a credentialed, non-http(s), or over-long URL.
- Rejects credentials in URLs (`WEB_BLOCKED_URL`), unsupported content types (`WEB_UNSUPPORTED_CONTENT_TYPE`), binary responses, redirect status without Location, oversized declared `Content-Length` (`WEB_FETCH_TOO_LARGE`).
- `Content-Length` over the cap rejects immediately with `WEB_FETCH_TOO_LARGE`; a stream that grows past the cap is cut short (`truncatedByBytes: true`).
- **Known limitation stated in source**: 'Private-network and SSRF protection is not implemented; do not enable this provider where it can reach sensitive internal targets.' Important for App Builder — the fetch tool could be tricked into probing internal services.

## Selection semantics (from `packages/web/web/src/index.ts`)

`ctx.web` resolves a provider at execution time, not registration time:

- Configured id registered and `available()` -> that provider.
- Configured id not registered -> `WEB_PROVIDER_CONFIGURED_MISSING`.
- Configured id registered but unavailable -> `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider -> that provider.
- No id configured, multiple usable providers -> `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider -> `WEB_PROVIDER_UNAVAILABLE`.

`$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` env vars are equivalent to config fields — NOT a hidden priority chain.

## Tool layer (`dsh-tool-web`)

- Two tools: `web_search` (concurrent multi-query) and `web_fetch`.
- Default caps: `searchMaxResults` 8, `searchMaxQueries` 4, `fetchMaxOutputChars` 200k, `fetchTimeoutMs`/`searchTimeoutMs` 30 s.
- Cooperative tool-call budget enforced by `dsh-tool-call-timeout-policy` (a `tools/execute` wrapper).
- HTML bodies rendered to markdown via `turndown` with GFM tables/strikethrough; text bodies pass through.
- Non-2xx HTTP status is a result, not an error (per `dsh-tool-web/README.md`).

## Plan implications

Phase 1/2 do not need new web providers. The shipped three (DeepSeek/Perplexity/Exa) cover search; the shipped one (anonymous HTTP) covers fetch. App Builder-specific needs:

1. **Fetch + SSRF**: `web-fetch-http` explicitly does not protect against SSRF. App Builder MUST either (a) deploy behind an egress proxy, (b) restrict the fetch tool's visibility per project, or (c) ship an SSRF-protecting fetch provider. Recommend documenting this in the App Builder's deployment guide.
2. **Default credentials**: shipped config uses `DEEPSEEK_API_KEY` for both chat-completions (LLM) and Anthropic-compatible Messages (search). One key serves two surfaces. Document this.
3. **Provider selection in the App Builder UI**: the user picks `web_search` and `web_fetch` providers via the Settings page. No code change.
4. **No browser cookies**: per `web-fetch-http`, 'requests carry no browser cookies or ambient credentials'. Good.

## Plan mismatches identified (carried to Step 14)

- Plan does not mention the credential-bearing redirect policy. We should add it to the App Builder's safety contract.
- Plan does not mention the SSRF caveat for `web-fetch-http`. The fetch tool can be tricked into probing internal services. This is a deploy-time concern.
- Plan does not mention that one `DEEPSEEK_API_KEY` serves both LLM and search surfaces. Rotation discipline applies.
- Plan does not mention that `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are selection-time, not priority-chain — useful for the App Builder's deployment.
- Plan does not mention the `recordRequest` log for DeepSeek search. Useful for audit.
- Plan does not mention the search `WEB_PROVIDER_CREDENTIAL_MISSING` failure mode when no key is mounted. Important UX for first-run.
- Plan does not mention the `WEB_PROVIDER_AMBIGUOUS` failure when multiple usable providers exist with no configured id. The App Builder UI should make the selection explicit.
