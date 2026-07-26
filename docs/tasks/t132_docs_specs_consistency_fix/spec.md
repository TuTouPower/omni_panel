# Task spec

## 背景

review_20260726_054747 采纳项 4、5、7、8、9：specs_index slug 不一致；window-management 交叉引用失效；decisions.md ADR 008 重复；platform-services-electron 错称后台续期；config-store providerForcePercent 类型过时。

## 范围

- `docs/specs_index.md` slug 改 `vendor_forms_oauth_weblogin`。
- `docs/specs/window-management.md` 引用改 `ipc-api.md`/`ipc-electron.md`、`ui-views-desktop.md`/`ui-views-web.md`。
- `docs/blueprint/decisions.md` 较晚墓碑机制 008 改 009，同步仓库内引用。
- `docs/specs/platform-services-electron.md` 后台续期改「未实现」，删 `cookieRefreshHours` 既有能力表述。
- `docs/specs/config-store.md` `providerForcePercent` 类型改 `Partial<Record<string, boolean>>`。

## 非范围

- 不改代码；不调整第一个 ADR 008。

## 验收标准

- [ ] specs_index slug 与文件名一致且 snake_case。
- [ ] window-management 引用全部指向存在的文件。
- [ ] decisions.md 编号唯一递增，墓碑决策为 009。
- [ ] platform-services-electron 不再把后台续期描述为既有能力。
- [ ] config-store 类型描述与 `src/shared/types/config.ts` 一致。

## 依赖与约束

- 改 ADR 编号前先全局搜索引用。
