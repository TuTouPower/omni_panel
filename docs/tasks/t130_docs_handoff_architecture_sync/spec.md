# Task spec

## 背景

review_20260726_054747 采纳项 21、1、33：handoff 停在 t111，缺 t121/t122 汇总；architecture.md renderer 目录树未记录 t122 拆分产物；LocalAPI 仍描述为仅 `127.0.0.1`、Bearer、只 ingest+health，与 web-panel 已确认决策及代码冲突。

## 范围

- `docs/handoff.md` 追加一条 t121+t122 汇总交接（当前 branch、head_commit、遗留 finding 指向）。
- `docs/blueprint/architecture.md` renderer 目录树补 `views/settings-view/`、`components/settings/`、`components/AccountDialog.tsx`、`hooks/use_connector_catalog.ts`。
- `docs/blueprint/architecture.md` LocalAPI 描述对齐 `web-panel.md`：绑 `0.0.0.0`；仅 `/v1/ingest` 需 Bearer；其余 web 端点免认证且可返回明文密钥；信任前提为可信 LAN，并引用风险接受说明。

## 非范围

- 不改源码；handoff 只追加。

## 验收标准

- [ ] handoff.md 顶部追加含 branch/head_commit 的 t121+t122 汇总段。
- [ ] architecture.md renderer 目录树含 t122 拆分后全部新文件/目录。
- [ ] architecture.md LocalAPI 描述与 `web-panel.md` 及当前代码一致。
- [ ] handoff 未改动既有段落。

## 依赖与约束

- 无。
