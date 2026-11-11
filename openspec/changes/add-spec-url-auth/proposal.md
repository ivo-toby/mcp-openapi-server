# Change: Send HTTP auth when loading the OpenAPI spec from a same-origin URL

## Why

Many APIs serve their own OpenAPI document behind the same bearer-token or API-key auth as the rest of the API. The server only sends `--headers` / `AuthProvider` headers with API calls, so loading such a spec fails with `HTTP 401` / `HTTP 403` (follow-up to #96, tracked in #110). Sending those headers to every spec URL would leak credentials when the spec is hosted elsewhere (spec registries, CDNs, docs sites), so the default has to be scoped.

## What Changes

- Spec requests to an `--openapi-spec` URL on the same origin (scheme + host + port) as `--api-base-url` carry the configured auth headers (static `--headers` or `AuthProvider.getAuthHeaders()`)
- A redirect off that origin continues without auth headers; every redirect hop is re-checked
- A 401/403 on an authenticated spec request calls `AuthProvider.handleAuthError()` and retries once when it returns `true`, matching `ApiClient`
- New option `specAuth` (`--spec-auth` / `SPEC_AUTH`): `same-origin` (default), `always` (send to the spec URL's own origin, even when it differs from the API), `never` (previous behavior)
- Specs without auth headers to send keep using the existing fetch path unchanged

## Impact

- Affected specs: `spec-url-auth`
- Affected code: `src/openapi-loader.ts`, `src/tools-manager.ts`, `src/server.ts`, `src/config.ts`, relevant tests, `README.md`, `docs/auth-provider-guide.md`
- Behavior change: specs on the API's own origin now receive the configured auth headers by default; `--spec-auth never` restores the previous behavior
