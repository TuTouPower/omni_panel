# p256 darwin 托盘菜单点桌面空白收起兜底

- 来源：t503 遗留（t503_gen_f001 minor；复述已合 main 实现同样适用；原 p255 留在未合 t503 分支，本条为 main 侧正本）
- 内容：darwin 下托盘菜单经 showInactive 打开后若从未获焦，直接点桌面空白不触发 blur，当前仅靠托盘左/右键 toggle 与菜单内 TRAY_HIDE 收起；若 AC-004 真机验证复现卡死，为 darwin 补 app 级失活兜底或文档化「再点托盘收起」。workaround：再点一次托盘。
- 处理：main
