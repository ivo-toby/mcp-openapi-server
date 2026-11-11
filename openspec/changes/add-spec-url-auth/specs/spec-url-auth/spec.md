## ADDED Requirements

### Requirement: Spec URL authentication scope

The server SHALL send the configured HTTP authentication headers (static headers or `AuthProvider.getAuthHeaders()`) with OpenAPI spec requests only to origins allowed by the `specAuth` mode, which defaults to `same-origin`.

#### Scenario: Spec on the API origin

- **WHEN** `--openapi-spec` is a URL with the same scheme, host and port as `--api-base-url` and auth headers are configured
- **THEN** the spec request includes those auth headers

#### Scenario: Spec on a different origin

- **WHEN** `--openapi-spec` is a URL on a different origin than `--api-base-url` and `specAuth` is `same-origin`
- **THEN** the spec request is sent without auth headers

#### Scenario: Always mode

- **WHEN** `specAuth` is `always`
- **THEN** auth headers are sent to the spec URL's own origin even if it differs from `--api-base-url`

#### Scenario: Never mode

- **WHEN** `specAuth` is `never`
- **THEN** spec requests never include auth headers

#### Scenario: Invalid mode

- **WHEN** `--spec-auth` or `SPEC_AUTH` is not one of `same-origin`, `always`, `never`
- **THEN** configuration loading fails with a clear error

### Requirement: Redirects do not leak spec auth

The server SHALL re-check every redirect hop of an authenticated spec request and SHALL NOT send auth headers to a hop outside the allowed origin.

#### Scenario: Cross-origin redirect

- **WHEN** an authenticated spec request is redirected to another origin
- **THEN** the redirected request is sent without auth headers

#### Scenario: Same-origin redirect

- **WHEN** an authenticated spec request is redirected within the allowed origin
- **THEN** the redirected request includes the auth headers

### Requirement: Spec auth error handling

The server SHALL handle 401/403 responses to authenticated spec requests the same way as API calls.

#### Scenario: AuthProvider recovers

- **WHEN** an authenticated spec request returns 401 or 403 and `AuthProvider.handleAuthError()` returns `true`
- **THEN** the request is retried once with fresh headers from `getAuthHeaders()`

#### Scenario: AuthProvider does not recover

- **WHEN** `handleAuthError()` returns `false`, or the retry also fails with 401/403
- **THEN** spec loading fails with the HTTP status in the error
