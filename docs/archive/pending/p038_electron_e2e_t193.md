# p038 electron e2e 一批账号/表单用例在 t193 基线上已失败（2026-08-03）

- 来源：t194 黑盒（全量 electron e2e）对比确认
- 内容：`auto_seed`（existing config not overwritten）、`plugin_config`×3、`secrets_persistence`×3、`settings_view`×2、`popup_window_constraints`（collapsing all cards 底部留白）、`tray_menu_actions`（quit 菜单标签）共 11 个用例在 t193 HEAD（bb31938d）同样失败（stash t194 改动后逐组复跑确认一致），非 t194 引入。共性是 settings 账号/表单渲染与 connector 加载路径，疑为 t189-t193 范围内回归或本机环境（connector 发现/auto-seed）差异。
- 处理：t203
