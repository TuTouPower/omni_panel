/**
 * CLI 帮助文本（打包进主进程；用户面对的唯一入口是二进制本身）。
 */
export const CLI_HELP_TEXT =
    "OmniPanel CLI\n" +
    "用法：\n" +
    "  omni_panel <子命令> [选项]                    命令行操作（无参打印本帮助）\n" +
    "  omni_panel --gui                              启动图形界面（桌面图标同效）\n" +
    "  omni_panel serve [--port <n>] [--user-data-dir <dir>] [--foreground]\n" +
    "                                                无窗口常驻服务（默认后台；--foreground 前台）\n" +
    "  omni_panel open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]\n" +
    "                                                瘦客户端控制\n" +
    "  omni_panel export [--include-secrets] [--port <n>]\n" +
    "                                                导出配置\n" +
    "  omni_panel help | --help | -h                 本帮助\n" +
    "停止后台服务：omni_panel quit --port <n>\n" +
    "数据：默认 ~/.config/OmniPanel（可用 --user-data-dir 覆盖）\n";
