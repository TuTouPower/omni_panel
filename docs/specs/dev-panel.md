# Dev panel

## Scope

The `dev` route is the fifth panel. Desktop opens it in a singleton window; the web build uses `#dev`. `AppConfiguration.devPanel` persists `scanRoots`, `commitCutoff`, and `currentUserOnly`.

## Host contract

The host owns all Git access. Desktop IPC channels `devPanel:scan`, `devPanel:status`, and `devPanel:cancel`, plus LocalAPI endpoints `/v1/devPanel/scan`, `/v1/devPanel/status`, and `/v1/devPanel/cancel`, call the same `DevPanelScanManager`.

Git is invoked with `execFile` and `shell: false`. Discovery and `git log` are read-only. Repositories are de-duplicated by the canonical `git rev-parse --git-common-dir`, including overlapping roots and worktrees. Each root has a 30-second cancellation boundary; failures are returned with the affected root while other roots continue.

Results contain `scanned_at`, a monotonic `data_version`, local `timezone`, daily counts, repository summaries, author summaries, committer summaries, and readable errors. Daily buckets use the author date converted to the host's local timezone. `currentUserOnly` matches `%an/%ae` against global Git identity; when either global identity field is unavailable, the scan warns and falls back to all authors. `%cn/%ce` is displayed separately and never drives the author filter.

## Renderer contract

`DevPanelView` owns configuration editing, scan/cancel actions, status polling while a scan is running, freshness labels, partial-error presentation, and the ECharts calendar heatmap. Colors, type, spacing, and controls use the existing DESIGN tokens and UI component library.

## Model routing

The model-routing section reads the user-owned `~/kar/code/my_file/config/files/new_api.yaml` in the host process. The public response contains only the model presets, aliases, slot expansion state, and configuration paths; the external `session` credential never crosses IPC or LocalAPI into the renderer/browser.

Desktop `devPanel:modelRouting*` IPC and LocalAPI `/v1/devPanel/modelRouting/{config,channels,save,test,snapshot}` call the same host manager. Channel reads use paginated `data.items` responses. Saves update only supported default-group channels, preserve real/non-slot models and unrelated mappings, make same-model priorities unique, write sequentially, stop after the first failure, and report success/failed/skipped channel changes. A host-local `models`/`model_mapping`/`priority` snapshot is written before the first update and is not automatically restored. Both desktop and Web require the same explicit confirmation before saving.
