# Task log

## 2026-07-21 T025 实施

### 改动

- electron restart case selector 修正（SettingsView 重构后）：
    - `.ao-item` → `.accent-row`（T023，但 .accent-row 是 appearance 页颜色行，非 accounts row）
    - 改 `sPage.locator(":scope").filter({ hasText: "DeepSeek" }).getByTitle("编辑")`（accounts row 文本含 DeepSeek + 编辑按钮定位）
    - accounts 页无 provider tabs（非 DeepSeek tab，直接 connector row），删 DeepSeek tab 点
    - restart 后 openViaIpc + accounts nav + filter DeepSeek + edit + API 密钥断言

### 验证

- `pnpm test:e2e:electron --grep "persists secrets"` → 1 passed（2.8s，含 restart）
- secret 持久化：fill "sk-e2e-secret" → stop/start → API 密钥 input 值 "sk-e2e-secret" + type="password"（不明文 config.json）
