# p205 index.ts 两处过期 local 注释（t437 范围外残留）

- 来源：t437 review 顺手发现
- 内容：`src/main/index.ts:489-490` 注释仍写「homedir 供非 Windows 宿主 local 源，win_home 供 Windows 宿主 local 源」、`:514` 注释仍写「Env 已与 token-stats 对齐为 local|wsl」——t437 已改四值 `win|wsl|linux|mac`，注释与代码不符。两处不在 t437 diff 内故未顺手改。改动为纯注释修订，无行为影响。
- 处理：未开
