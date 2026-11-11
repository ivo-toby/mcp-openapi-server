## 1. Implementation

- [x] 1.1 Add `specAuth` config option with `--spec-auth` / `SPEC_AUTH` and validation
- [x] 1.2 Pass the server's auth provider and `specAuth` mode through `ToolsManager` to `OpenAPISpecLoader`
- [x] 1.3 Send auth headers on spec requests that the mode allows, re-checking the origin on each redirect hop
- [x] 1.4 Call `handleAuthError()` on 401/403 for authenticated spec requests and retry once when it returns `true`
- [x] 1.5 Keep the plain fetch path for spec requests with no auth headers and no TLS settings
- [x] 1.6 Add regression tests for same-origin, cross-origin, cross-origin redirect, `always`/`never` modes and the 401 retry path
- [x] 1.7 Document the behavior in README and the AuthProvider guide
