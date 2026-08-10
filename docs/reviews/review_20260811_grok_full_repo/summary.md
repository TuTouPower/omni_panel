# Review Summary

- **Mode**: full-repository (current working tree)
- **Target**: OmniPanel production surface (src/, connectors/, schemas/, scripts/, root security-relevant configs)
- **Files reviewed**: inventory 349 production files; deep-read critical main/ipc/vault/local-api/connector/window; sampled renderer/oauth/scheduler
- **Diff stats**: N/A (full-tree review, not branch/PR diff)
- **Issue counts**: 6 bugs, 5 suggestions, 2 nits

## Top issues

- [bug] local-api/server.ts:993 -- LocalAPI on 0.0.0.0 with secrets/control/auth unauthenticated
- [bug] config-ipc.ts:193 -- concurrent config save conflict detection defeated by memory cache
- [bug] net-client.ts:199 -- absolute path URL can exfiltrate vault-injected auth
- [bug] net-client.ts:321 -- JSON parse failure logs full response body
- [bug] file-vault-backend.ts:161 -- vault .bak written without 0o600 hardening

See the full review at: /tmp/grok-1000/grok-review-0898dce0.md
