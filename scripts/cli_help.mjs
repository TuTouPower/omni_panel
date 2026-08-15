/**
 * CLI 帮助文本单一真相源（t400）。
 * launcher（scripts/omni_panel.mjs）运行时 import；
 * 主进程（src/main）import 后由 electron-vite 构建期内联进 out/main（d038）。
 */

export const CLI_HELP_TEXT =
    "OmniPanel CLI\n" +
    "用法：\n" +
    "  omni_panel <子命令> [选项]                    命令行操作（默认 CLI；无参打印本帮助）\n" +
    "  omni_panel --gui                              启动图形界面（双击桌面图标同效）\n" +
    "  omni_panel serve [--port <n>] [--user-data-dir <dir>] [--foreground]   无窗口常驻服务（默认后台；--foreground 前台）\n" +
    "  omni_panel open|refresh-all|pause|resume|restart|quit|autostart [--port <n>]\n" +
    "                                                                        瘦客户端控制\n" +
    "  omni_panel export                                                       导出配置\n" +
    "  omni_panel help                                                         子命令帮助\n" +
    "停止后台服务：omni_panel quit --port <n>\n" +
    "兼容：--cli 前缀仍可用（omni_panel --cli serve ...），行为不变。\n" +
    "数据：全局命令使用真实用户数据（~/.config/OmniPanel，可用 --user-data-dir 覆盖）\n";
