# Task spec

## 背景

review_20260726_054747 采纳项 21、1、33、2、3、4、5、7、8、9、22、27（合并原 t130/t131/t132/t136/t145）：blueprint 与 handoff、bugs、specs 之间多处文档不一致，需一次性对齐。

## 范围

- `docs/handoff.md` 追加 t121+t122 汇总交接（branch、head_commit、遗留 finding）。
- `docs/blueprint/architecture.md`：renderer 目录树补 t122 拆分产物；LocalAPI 描述对齐 web-panel（绑 0.0.0.0、仅 /v1/ingest 需 Bearer、可信 LAN）；connector 本地运行模型（node:vm 运行时隔离）。
- `src/main/core/connector/runtime.ts` 修正失效 `D8` 引用。
- `docs/blueprint/domain.md` 内置直连 provider 补 `getoneapi`、`exa`、`tikhub`。
- `docs/bugs.md` 最后一条追加「修复：t111」。
- `docs/specs_index.md` slug 改 `vendor_forms_oauth_weblogin`。
- `docs/specs/window-management.md` 引用改 ipc-api/ipc-electron/ui-views-desktop/ui-views-web。
- `docs/blueprint/decisions.md` 较晚墓碑 ADR 008 改 009，同步引用。
- `docs/specs/platform-services-electron.md` 后台续期改「未实现」。
- `docs/specs/config-store.md` providerForcePercent 类型改 string key。
- `docs/blueprint/conventions.md` 记录 renderer 命名随触碰迁移策略。

## 非范围

- 不改任何业务逻辑代码（仅 runtime.ts 注释修正）。
- 不做权限/安全管控（不设风险提示 UI、不改 sandbox 机制）。
- handoff 只追加。

## 验收标准

- [ ] handoff 追加 t121+t122 汇总，未改既有段落。
- [ ] architecture renderer 树、LocalAPI、sandbox 模型与代码及 web-panel 一致。
- [ ] runtime.ts 不再引用不存在的 D8。
- [ ] domain provider 枚举完整；bugs.md 含 t111 修复行。
- [ ] specs_index slug 一致；window 引用有效；ADR 编号唯一；续期描述准确；providerForcePercent 类型正确。
- [ ] conventions 记录命名迁移策略。

## 依赖与约束

- 无。改 ADR 编号前先全局搜索引用。
