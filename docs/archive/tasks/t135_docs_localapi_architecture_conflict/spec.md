# Task spec

## 背景

review_20260726_054747 采纳项 33（核验新发现）：`architecture.md:49,77` 描述 LocalAPI「仅 127.0.0.1、Bearer、只 ingest+health」，与 `web-panel.md` 已确认决策（绑 0.0.0.0、web 免认证、/v1/secrets 明文）及代码 `server.ts:472` 冲突，导致 H3 被误判为新发现。

## 范围

- `architecture.md:49` local-api 行改为绑 `0.0.0.0`。
- `architecture.md:77` 改为：仅 `/v1/ingest` 需 Bearer，其余 web 端点免认证且可返回明文密钥，信任前提可信 LAN，引用 `web-panel.md` §2.1。

## 非范围

- 不改 LocalAPI 实现或绑定地址。

## 验收标准

- [ ] architecture.md 两处 LocalAPI 描述与 web-panel.md 一致。
- [ ] 不再出现「仅 127.0.0.1」的过时表述。

## 依赖与约束

- 仅文档对齐，不改产品决策。
