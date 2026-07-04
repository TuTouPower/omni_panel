# Logging system hardening design

## Goal

Make OmniUsage logs safe and useful for user-exported diagnostics while keeping the logger interface small.

## Scope

In scope:

- Add user-configurable log level in Settings.
- Keep development default at `debug`; use `info` as the production default.
- Write structured JSONL log records.
- Flush pending file logs before app shutdown.
- Throttle renderer-to-main log IPC.
- Add trace IDs to IPC, refresh, and connector polling logs.
- Make metadata redaction safe by default.
- Replace direct renderer `console.warn` with the shared logger.
- Add tests before implementation.

Out of scope:

- Remote log upload.
- Crash dump collection.
- Log search UI.
- Historical log viewer.

## Interface

The external logger interface remains `createLogger(module)` with `debug`, `info`, `warn`, and `error` methods. Callers continue passing a message and optional metadata.

The logging module gains internal support for contextual metadata. Trace-aware code can create a scoped logger or pass `trace_id` in metadata. The preferred shape is a small helper that does not force unrelated callers to learn tracing.

## Configuration and UI

Add `logLevel?: "debug" | "info" | "warn" | "error"` to `AppConfiguration` and the config schema.

Default level:

- Development: `debug`
- Production: `info`

Settings adds a small diagnostics row for log level. Saving config calls `setLogLevel` in main and propagates the updated config to renderers through the existing config-change path. Renderer log filtering uses the same level after config is loaded.

## Log format

File logs use one JSON object per line with these fields:

- `ts`: ISO timestamp
- `level`: log level
- `module`: logger module name
- `message`: short human-readable text
- `meta`: redacted JSON-compatible metadata, omitted when empty
- `trace_id`: optional chain ID for one user action / refresh / IPC call

The export flow still copies the current `.log` file. The extension can remain `.log`; the contents are JSONL.

## File transport and flush

The file transport owns a write queue. `write()` enqueues records quickly. `flush()` waits for queued appends to finish.

`initLogging()` returns cleanup that removes transports and flushes pending writes. App shutdown awaits flush before destroying the process where Electron lifecycle allows it.

Write failures do not crash the app. They are recorded through the console transport in development and otherwise swallowed after one warning to avoid recursive log storms.

## Renderer log IPC throttling

The preload log method sanitizes fields and throttles per renderer process.

Policy:

- Allow a fixed burst per one-second window.
- Drop extra renderer logs in that window.
- Emit one synthetic warn when drops occurred: `renderer logs throttled`, with `dropped_count`.

This protects main IPC and file logs from renderer error loops while preserving the signal that logs were dropped.

## Redaction

Redaction is default-safe:

- Any metadata key matching secret-like names is replaced with `***`.
- Matching is case-insensitive and includes `token`, `api_key`, `key`, `secret`, `password`, `cookie`, `authorization`, `credential`, and `session`.
- Existing `scrubber.register()` still redacts exact secret values in messages and metadata.
- Config-specific redaction remains for full config payloads.

Messages are scrubbed by registered secret values. Metadata is scrubbed by both key and registered value. This avoids leaking new connector secrets when a caller forgets custom redaction.

## Trace IDs

Trace IDs are short opaque strings generated at the entry point of a chain:

- `createLoggedIpcHandler` creates one per IPC call.
- Refresh service / connector scheduler creates one per refresh run.
- Connector runtime passes the trace ID into connector context logs.

All logs in the chain include the same `trace_id`. No UI exposes trace IDs initially; they are for exported diagnostics.

## Testing

Follow TDD. Add failing tests first for:

1. Logger JSONL formatting and default metadata redaction.
2. File transport flush waits for queued writes.
3. Config schema accepts and persists `logLevel`.
4. Settings UI renders and saves log level.
5. Renderer log transport / preload throttles and reports drops.
6. IPC logged handler includes a trace ID in request result logs.
7. Direct console use in `AddAccountDialog` is replaced by shared logger behavior.

Run targeted tests after each red-green cycle, then run `pnpm test` before completion.

## Documentation

Update project docs only where they describe diagnostics, settings, or logging behavior. Do not edit `docs/design/omni-usage/`.
