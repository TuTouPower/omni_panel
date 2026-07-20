# Task spec

## 背景

T016 code_f004 遗留：`popup_card_collapse_height` / `popup_height_debounce` / `popup_refresh_state_reset` 等 spec 用 `button[aria-label="展开 ${label}"]` 把账号 label（邮箱）直接拼 CSS attribute selector，未转义 `"`/`]`/`\`。当前 fixture label 是邮箱无特殊字符稳定，但脆弱。

## 范围

- 上述 spec 的 `button[aria-label="...${label}"]` -> `getByRole("button", { name: \`展开 ${label}\`, exact: true })`（Playwright 内部处理转义）
- 全量扫 web/ 下所有 CSS attribute selector 拼 label 的地方统一改

## 非范围

- 不改 non-label 的 CSS selector（如 `.card-grip` class）
- 不改 electron spec

## 验收标准

- [ ] web/ 下无 `aria-label="${...}"` 拼 label 的 CSS selector
- [ ] `pnpm test:e2e:web`（real + synthetic）全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- 无
