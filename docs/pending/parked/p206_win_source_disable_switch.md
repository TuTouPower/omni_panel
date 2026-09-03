# p206 WSL 宿主 win 源采集缺关闭开关

- 来源：t438 review code_f004 遗留
- 内容：t438 让 linux/WSL 宿主零配置自动采集 Windows 侧 agent 数据（env=win），但未提供关闭开关——用户若不想扫 /mnt/c 只能配置空 win_home_wsl 哨兵（未暴露到设置 UI）。t438 spec 非范围允许不做。需决策：设置页加开关 vs 配置项文档化。
- 处理：不办
- 暂搁：用户决策:不需要 win 源采集关闭开关(2026-09-04)
