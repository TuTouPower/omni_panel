# CONFIG_SAVE_SECRETS 缺 settings 路由门

- 来源：Grok 全仓评审（2026-08-11）
- 内容：Grok Issue 7：CONFIG_GET_SECRETS 有 assert_setting_route，CONFIG_SAVE_SECRETS 仅 assert_valid_sender；preload 已 stub 非 settings 路由，非当前可利用，防御纵深不一致
- 处理：已直接修复（2026-08-11，无 task；见 git log config-ipc/window-manager/server.ts 小修）
