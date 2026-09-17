# p252 日志切分、日志时间戳与导出文件名使用 UTC 导致国内时区排查反直觉（全部改成中国时间/本地时区）

- 现象：中国时区（UTC+8）用户在 00:00~08:00 期间操作与排查时，日志文件按 UTC 日期归档为前一天（例如 2026-09-18 凌晨 03:23 产生的日志被写入 `app-2026-09-17.log`）；日志条目中的 `ts` 也是 UTC 零时区时间戳（如 `2026-09-17T19:23:02.416Z`）；日志导出与配置导出的默认文件名亦为前一天日期（如 `omni-panel-log-2026-09-17.log`）。与用户本地现实日期脱节，极易产生排查困惑。
- 影响：本地排查日志定位、日志查看器展示、CLI/后台服务日志归档、配置备份导出等全链路，在 UTC+8 凌晨时段均呈现为前一天的日期；用户无法直观根据当日日期寻找日志。
- 根因：
    1. 【产品缺陷/未考虑本地时区】：`src/main/core/logging.ts:21-24` 中的 `getLogFilePath` 硬编码 `new Date().toISOString().slice(0, 10)`，直接截取 UTC 零时区日期作为切分与文件名依据。
    2. 【时间戳统一性缺失】：`src/shared/lib/logger.ts:108-110` 中的 `defaultTimestamp()` 直接使用 `new Date().toISOString()`，导致全量日志条目的时间戳均为 UTC 时间而非中国标准时间（UTC+8）或本地时间。
    3. 【同类位点清单】：
        - `src/main/core/logging.ts`：日志文件名与历史日志清理（`cutoff` 计算与文件名解析）；
        - `src/shared/lib/logger.ts`：日志条目时间戳 `ts`；
        - `src/main/ipc/log-ipc.ts:51`：日志导出默认保存文件名；
        - `src/main/ipc/config-ipc.ts:481`：配置导出默认保存文件名；
        - `src/main/cli/background_serve.ts:128`：后台服务日志文件命名；
        - `src/web/usageboard-web.ts:396, 668`：Web 模式配置导出与日志日期。
- 测试缺口：现有单元测试（如 `tests/unit/main/core/logging.test.ts`）大多只对时间戳或文件名做形如 `app-\\d{4}-\\d{2}-\\d{2}\\.log` 的正则断言，或在 mock 时直接注入 UTC 假时间，未覆盖跨午夜偏置（UTC 与本地时区日期不同步）的场景。
- 线索：本地日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-17.log` 最后修改时间为 2026-09-18 03:23，但文件名为 09-17。
- 处理：t502
