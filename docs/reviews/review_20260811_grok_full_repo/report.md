## Summary

OmniPanel’s desktop IPC boundary is generally solid: `contextIsolation`/`sandbox`/`nodeIntegration:false`, sender URL allowlisting, route-gated `CONFIG_GET_SECRETS`, secret stripping in `CONFIG_GET`, vault AES-GCM with atomic writes, and scrubber registration on decrypt. The dominant risk is **LocalAPI bound to `0.0.0.0` with almost the entire control plane and secret surface unauthenticated**—LAN peers can read/write vault secrets, export config with secrets, quit/restart the app, and drive auth flows. Secondary high-confidence issues: broken concurrent config conflict detection (memory cache), connector HTTP absolute-path URL override after host auth injection, and response-body logging that can leak credentials.

## Issues

### Issue 1 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/local-api/server.ts:993
- Description: LocalAPI listens on `0.0.0.0` (line 1545) and serves nearly all sensitive routes **without** Bearer auth. Auth is only enforced after the unauthenticated handlers (line 1038), so the following are open to any host that can reach the port: `GET/POST /v1/secrets` (plaintext vault read/write, 1343–1357), `GET /v1/config/export?includeSecrets=true` (1310–1317), `POST /v1/config/import` and config save, OAuth/cookie/session login (778–933), session-history content search, log export (1033–1035), and control plane `POST /v1/control/{refresh-all,pause,resume,restart,quit}` (1419–1440, explicitly “免认证”). A random token is generated (725) but only used for `/v1/ingest`. Architecture documents this as “trusted LAN,” but binding all interfaces plus secret dump/control without auth is a critical exposure on shared Wi‑Fi, misconfigured firewalls, or multi-user machines.
- Suggestion: Require Bearer (or equivalent) for all mutating and secret-bearing routes; at minimum gate `/v1/secrets`, `includeSecrets` export, config import/save, control, and auth. Prefer bind `127.0.0.1` by default with an explicit opt-in for LAN. Reuse the existing `check_auth`/`token` path already implemented for ingest.
- Status: open

### Issue 2 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/main/ipc/config-ipc.ts:193
- Description: Concurrent-save conflict detection re-calls `configStore.load()` and compares JSON to the pre-merge snapshot. `createConfigStore` serves load from an in-memory cache until `save()` completes (`config-store.ts` ~201–205, 390–394). Two overlapping `CONFIG_SAVE` / web `POST /v1/config` handlers therefore both re-load the same cached value, both pass the CONFLICT check, and both call `save()`—the later write silently overwrites the earlier (lost updates for plugins/settings). The intended race guard never observes mid-flight peer writes.
- Suggestion: Introduce a monotonic config generation/version (or content hash) updated only on successful save; conflict-check against that under the save mutex. Alternatively perform merge+validate inside a single exclusive critical section that re-reads after acquiring the lock, not against a stale cache hit.
- Status: open

### Issue 3 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/connector/net-client.ts:199
- Description: Request URL is built as `new URL(options.path, base)`. If `path` is an absolute or protocol-relative URL (`https://evil.example/...` or `//evil.example/...`), the URL API replaces the manifest endpoint origin. Auth is applied afterward via `apply_request_auth` (203) or script-supplied headers, so a hostile/compromised connector script (user `connectors/` dir is loaded by `manifest-loader.ts`) or a crafted poll path can send vault-injected API keys/cookies to an attacker host. `assert_safe_connector_host` only blocks cloud metadata hosts (115–124), not arbitrary public hosts.
- Suggestion: After URL construction, require `url.origin` to equal the resolved endpoint base origin (or allow only relative paths starting with `/`). Reject absolute URLs and `//` protocol-relative paths. Apply the same check in poll/probe executors.
- Status: open

### Issue 4 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/connector/net-client.ts:321
- Description: On JSON parse failure the full response body is logged: `JSON parse failed for ...: ${text}`. Upstream error pages, HTML intercept portals, or partially JSON-like token responses can contain credentials, session fragments, or PII. Scrubber only redacts vault values already registered; response bodies are not registered. OAuth helpers correctly avoid logging bodies (`oauth_helpers.ts` 120–123); connector HTTP does not.
- Suggestion: Log status, origin/path, content-type, and body length only (optionally a fixed small redacted prefix). Never log full bodies at warn/info.
- Status: open

### Issue 5 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/vault/file-vault-backend.ts:161
- Description: Primary vault file is written with `chmod: 0o600` and `set_file_permissions` (155–156). The `.bak` copy uses plain `writeFile` without mode or ACL hardening, so on multi-user Unix the backup ciphertext (and recovery path) may be world-readable depending on umask. Same pattern is weaker than the main vault path.
- Suggestion: Write `.bak` via the same atomic path + `chmod 0o600` / `set_file_permissions`, or omit world-readable default.
- Status: open

### Issue 6 -- Severity: bug

- File: /home/karon/karson_ubuntu/omni_panel/src/renderer/components/workspace/MarkdownMessage.tsx:61
- Description: Session-history markdown renders `<a href={href}>` with no scheme allowlist and no `rel`/`target` hardening. Message content is untrusted (user/agent logs). A `javascript:`, `file:`, or unexpected scheme link can navigate the history `webContents` (no `will-navigate` guard on panel windows—only `setWindowOpenHandler` for new windows in `window-manager.ts:187`). That can hijack the session-history surface or open local resources.
- Suggestion: Only allow `http:`/`https:` hrefs (else render as text); use `target="_blank"` + `rel="noopener noreferrer"` and/or handle clicks via IPC `shell.openExternal`. Add `will-navigate` deny-except allowlist on app windows.
- Status: open

### Issue 7 -- Severity: suggestion

- File: /home/karon/karson_ubuntu/omni_panel/src/main/ipc/config-ipc.ts:679
- Description: `CONFIG_GET_SECRETS` correctly requires `assert_setting_route` (687–688). `CONFIG_SAVE_SECRETS` only calls `assert_valid_sender` (680)—no settings-route gate. Preload stubs write methods for non-setting routes, so this is not currently an easy renderer exploit under contextIsolation, but main-process defense-in-depth is inconsistent: any future preload/bug or test helper exposing `ipcRenderer` could write vault secrets from a non-settings window.
- Suggestion: Add `assert_setting_route(e)` to `CONFIG_SAVE_SECRETS` (and consider the same for `CONFIG_EXPORT`/`CONFIG_IMPORT` if those should be settings-only).
- Status: open

### Issue 8 -- Severity: suggestion

- File: /home/karon/karson_ubuntu/omni_panel/src/main/ipc/session-ipc.ts:38
- Description: Session login validates `login_url` is HTTPS only. Cookie login additionally enforces `loginDomains` from the manifest (`auth-ipc.ts` 69–76). Interactive session login accepts **any** HTTPS URL, including attacker-controlled phishing sites. Combined with unauthenticated LocalAPI `POST /v1/session/login` (Issue 1), a LAN attacker can open a login window to an arbitrary HTTPS host and harvest cookies if the user interacts.
- Suggestion: Reuse manifest `loginDomains` (or a fixed allowlist) for session login when `instance_id` is set; refuse arbitrary URLs from web without auth.
- Status: open

### Issue 9 -- Severity: suggestion

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/vault/file-vault-backend.ts:84
- Description: Master key is a random 32-byte file next to the vault under userData (`ensure_master_key`). Encryption-at-rest protects against casual offline scrapes of `secrets.vault` alone, but any process/user that can read userData can read both key and ciphertext and decrypt all API keys/cookies/OAuth tokens. This is weaker than OS keychain/DPAPI/libsecret binding.
- Suggestion: Prefer platform secret stores for the master key (Electron `safeStorage`, Windows DPAPI, macOS Keychain, libsecret). Document residual local-threat model clearly in user-facing security notes.
- Status: open

### Issue 10 -- Severity: suggestion

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/connector/runtime.ts:39
- Description: Connector scripts run in `node:vm` with pattern-based escape rejection. Architecture correctly states this is not a true security boundary. User-contributed connectors under the user connectors directory still receive vault-backed HTTP, optional `exposeToScript` secrets in `params`, and local file read within manifest paths. A determined script can still abuse host APIs (e.g. Issue 3) even without classic eval escapes.
- Suggestion: Treat user connectors as trusted code in UX/docs; consider process isolation (`utilityProcess`/`worker_threads` without vault, host-mediated HTTP only with path/origin policy) for untrusted connectors; keep blocklist as defense-in-depth only.
- Status: open

### Issue 11 -- Severity: suggestion

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/local-api/server.ts:654
- Description: Static web UI serving and JSON APIs set no `Content-Security-Policy`, frame-ancestors, or other hardening headers. Electron renderer CSP (`security/csp.ts`) does not apply to the browser-served web panel. On a reachable LAN endpoint this increases XSS blast radius if any future HTML injection lands in the SPA shell or error pages.
- Suggestion: Emit a strict CSP for static/HTML responses (script-src self, no unsafe-inline in prod), `X-Content-Type-Options: nosniff`, and deny framing.
- Status: open

### Issue 12 -- Severity: nit

- File: /home/karon/karson_ubuntu/omni_panel/src/main/window/window-manager.ts:188
- Description: `setWindowOpenHandler` does `new URL(url)` without try/catch. A malformed `url` throws inside the handler. Login windows created in `index.ts` (~564–576) do not install this handler at all, so `window.open` from provider login pages is unrestricted relative to main panel policy.
- Suggestion: Wrap URL parse in try/catch (deny on failure). Apply the same openExternal policy to session-login BrowserWindows.
- Status: open

### Issue 13 -- Severity: nit

- File: /home/karon/karson_ubuntu/omni_panel/src/main/core/connector/net-client.ts:278
- Description: HTTP ≥400 debug logging includes `body_text.slice(0, 200)`. Even truncated, auth error bodies often echo tokens or session identifiers. Lower severity than full-body warn (Issue 4) but same class.
- Suggestion: Omit bodies or log only length/hash at debug.
- Status: open

## Coverage notes

Inspected deeply:

- `docs/blueprint/architecture.md` (security boundaries, LocalAPI model)
- `src/main/core/vault/*`, `config/secrets-store.ts`, `config/config-store.ts`, `storage/write-json.ts`
- `src/main/ipc/config-ipc.ts`, `helpers.ts`, auth/session/oauth IPC
- `src/main/core/local-api/server.ts` (routing, auth, control, secrets, static)
- `src/main/core/connector/{net-client,runtime,manifest-loader,host-io}.ts`
- `src/main/core/scheduler/{refresh-service,connector-scheduler}.ts`
- `src/main/core/session/session-manager.ts`, `observation/observation-store.ts`
- `src/main/window/window-manager.ts`, `security/csp.ts`, `src/main/index.ts` (bootstrap, session login window, LocalAPI wiring)
- `src/preload/index.ts` (route capability matrix, secret stubs)
- `src/shared/lib/{logger,config_redaction}.ts`
- Sample connectors (path/auth patterns), `src/web/usageboard-web.ts`
- Root packaging: `electron-builder.yml` (fuses look sensible), `package.json` scripts

Sampled:

- Token-stats / session-history extractors (locator path model, subscription abort)
- Renderer settings/secret forms (change-diff before saveSecrets — good)
- OAuth managers (token store/refresh patterns — generally careful)
- CLI thin client (talks localhost control; inherits LocalAPI auth gaps)

Not fully audited line-by-line:

- Every connector implementation detail
- Full token-stats SQL aggregation / query-worker
- All renderer UI components beyond secret/IPC/XSS-sensitive surfaces
- `scripts/repo_template/**` (out of product runtime scope)

Domains that looked healthy relative to stated design: Electron secure prefs + preload route split for secrets read; vault atomic write + mutex; observation insert host stamping of `source_instance_id`; refresh locks/stale last-success; desktop export warns on `endpointOverrides`; ingest schema validation + body size limit.
