# p115 standard Button 字号类 text-body-md 被 tailwind-merge 吞

- 来源：t283 review Round 2 提示（t269 基线问题）
- 内容：`Button.tsx` base 的 `text-body-md`（字号 token）同样被 tailwind-merge 误判为颜色类吞掉（实测确认），standard 按钮字号 fallback 到继承值。t283 只修了 sm 档（`text-[length:var(--text-label-md)]`），standard 档 base 建议同步改 `text-[length:var(--text-body-md)]`。
- 处理：t298
