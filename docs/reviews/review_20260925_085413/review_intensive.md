# Intensive Review — 全仓 @ 326e88b6 2026-09-25

- Target: /Users/testuser/kar/code/omni_panel 全仓（文档/代码/文件名/配置/目录结构全部）
- SHA: 326e88b6545cd24ec500099e170c7a902edeff86（main，ahead origin/main；origin/main本地无ref，diff基线改用本地增量t507/t508+cce9b5df+工作区现状）
- TS: 20260925_085413（Asia/Shanghai）
- OUTDIR: docs/reviews/review_20260925_085413
- Bundles: 7（bundle_p1_security.md, bundle_p2_correctness.md, bundle_p3_contract.md, bundle_p4_perf.md, bundle_p5_arch.md, bundle_p6_robust.md, bundle_p7_testdoc.md）
- Scope: diff白名单43文件 + 全仓安全配置/信任边界/目录结构/文档一致性；src~750 TS文件，docs 2943文件，bundle.py白名单后43文件入bundle
- Findings: C/H/M/L/Info = 2/37/86/58/9（deduped 192，aggregate.py去重键file:line|title）
- Verdict: **BLOCK**（任意Critical即BLOCK；validation未跑typecheck/lint/test/build，只读审查）

## Summary

- 最危险两条均AGREE保留：LocalAPI 0.0.0.0+写端点免认证（LAN拖库/写配置/DoS）；连接器无签名+vm非隔离（user目录丢文件即主进程RCE）。
- High集中在：vault明文密钥、SSRF绕过、popup真写、PKCE verifier泄漏、refresh去重缺失、schemas双分叉、死契约、索引错配、50MB常驻、上帝文件x3、muse硬编码、last_error入库、门禁缺test。
- 交叉证伪15条Critical/High：12 AGREE（其中7建议降级High→Medium/Low但保留），3 CHALLENGED（stale无界增长不成立→有界语义bug；ondemand缺失→归档过期转卫生；改测TDD→已声明同步转注记）。CHALLENGED不删除，只降置信并附反证。
- 文档卫生重灾：README 16/17/20三值分裂、handoff/specs_index滞后超1月、上次10项零闭环。
- 修复优先级：先堵C（F01/F05）+ vault/SSRF/popup/PKCE，再修High可靠性（refresh/muse/错误处理），再批量文档/menlo门禁。

## Critical / High（必修）

### Critical（2）

- [C][95] src/main/core/local-api/server.ts:1987 — LocalAPI绑0.0.0.0且/v1/secrets,/v1/config,/v1/control免认证 — 证据：listen 0.0.0.0(1987,2001 log)，check_auth仅ingest后(1283)，config GET/POST(1703-1770)、secrets GET/POST(1753-1771)、control restart/quit(1861-1874注释免认证) — 攻击：LAN/DNS rebinding拖库+覆盖endpointOverrides联动SSRF+循环restart DoS — 修复：默认127.0.0.1，0.0.0.0显式opt-in；除/v1/health+静态外全强制check_auth — 交叉AGREE#1
- [C][90] src/main/core/connector/manifest-loader.ts:55 + runtime.ts:198 — 连接器无签名任意代码+vm非隔离 — 证据：load_definitions_from_dir无签名/哈希，vm.runInContext，architecture.md:94,267-271自认非真隔离非边界，extraResources明文释放 — 攻击：user目录丢manifest+connector.ts下轮refresh主进程执行，ctx.params读secret外发，constructor逃逸（黑名单5种可绕） — 修复：user dir默认禁用+显式信任+告警；长期isolated-vm/utilityProcess+内置SHA256清单 — 交叉AGREE#2

### High（37，含交叉降级建议）

安全/信任边界：

- [H][92] src/main/core/vault/file-vault-backend.ts:66 — 主密钥明文存vault旁 — writeFile 32B无DPAPI，chmod/icacls仅防他用户 — 修复：safeStorage加密主密钥+迁移
- [H][90] src/main/core/connector/net-client.ts:126 — SSRF blocklist 3精确host+私有段放行 — 十进制2852039166/hex/nip.io/::ffff绕过，override可指127.0.0.1:18263打免认证LocalAPI — 修复：dns.lookup后IP段比对（169.254/16,100.100.100.200,fd00:ec2::254）+禁127/10/172.16/192.168除非dev
- [H][88] src/preload/index.ts:724 — popup保留config.save真写 — popup分支save为真CONFIG_SAVE — XSS一击改endpointOverrides链SSRF — 修复：popup改noop仅setting可写
- [H][88] src/renderer/components/forms/GrokBotPkceForm.tsx:33 + preload/oauth_api.ts:139 + ipc/grok_bot_auth_ipc.ts:93 — PKCE verifier经renderer/IPC明文 — login_start返回{uuid,verifier}，poll无sender绑定 — 修复：verifier留main Map，renderer只见login_id
- [H][85] src/main/core/connector/runtime.ts:43 — 沙箱黑名单可绕过 — 修复：白名单+freeze+隔离进程
- [H][82] src/main/window/window-manager.ts:240 — will-navigate放行http/https — 修复：同窗http转openExternal/拒绝 [交叉降级Medium，纵深]
- [H][82] src/main/core/network/effective_proxy.ts:3 — 代理URL零校验劫持出站 — 修复：zod http(s)校验+禁内网+二次确认
- [H][90] electron-builder.yml:38 — enableCookieEncryption:false落盘明文 — 修复：true
- [H][90] docs/blueprint/architecture.md:272 — 配置导入重定向端点带走secret — 修复：endpoint变更标重录+预览diff+签名
- [H][60→保留] session-shell markdown疑无sanitize — 依赖仅react-markdown+remark-gfm，全仓无sanitize/DOMPurify — 修复：rehype-sanitize（confidence 60需复核MarkdownMessage）

正确/并发/数据：

- [H][85→M] src/main/core/scheduler/refresh-service.ts:587 — with_concurrency race无catch中断剩余 — then无finally+race无try — 修复：finally删+race.catch [触发需外层失败，降级Medium]
- [H][80→M] src/main/core/scheduler/refresh-service.ts:371 — stale复制注释与实现不符 — 修复：按(account,metric)取最大observed_at [“无界增长”CHALLENGED，有界≈键数，保留语义bug]
- [H][80] src/main/index.ts:176 — 单实例锁失败不return双开SQLite — 修复：quit后return/exit
- [H][85] src/main/core/auth/grok_bot_oauth_manager.ts:139 — 同instance并发poll覆盖cancel误删后者 — 修复：CONFLICT+finally仅删自己
- [H][90→M] src/main/core/auth/grok_bot_oauth_manager.ts:218 — 缺refresh去重 — 无inflight Map — 修复：Map去重 [部分缓解有实例锁/vault mutex，降级M]
- [H][85] connectors/opencode_go/connector.ts:140 — 吞auth错阻断重登 — catch转null致is_auth_error失明 — 修复：401/403直接抛会话失效
- [H][90→M] src/main/core/connector/net-client.ts:41 — 50MB Buffer.concat — 5并发250MB — 修复：降5-10MB+early-abort [触发需恶意端点，降级M]
- [H][90] src/main/core/scheduler/connector-scheduler.ts:32 — 5s定时无退避60x请求 — 修复：MIN 30-60s+指数退避+jitter
- [H][90] src/main/core/observation/observation-store.ts:266 — 索引错配window sort — 修复：idx_by_instance
- [H][85→M] src/main/core/connector/runtime.ts:148 — cooldown按manifest全局拦误伤多实例 — 修复：key加instanceId
- [H][85→M] src/main/core/scheduler/refresh-service.ts:450 — last_error原文入库透UI — 无scrub — 修复：scrub_text+截断 [含密概率低，降级]
- [H][80] src/main/core/scheduler/refresh-service.ts:587 — 单reject掀翻refreshAll（robust视角重复，同意向） — 修复：fn包catch
- [H][85] connectors/opencode_go/connector.ts:140 — 双catch null黑盒（robust） — 修复：记warn再降级
- [H][80] src/shared/lib/logger.ts:22 — 脱敏洞+10k巨正则 — 修复：加verifier/proxy/jwt/bearer，set同步register

契约/spec：

- [H][90→M] docs/archive/tasks/t507…/spec.md:15 — ondemand承诺缺失 — 仅归档spec有双指标，现行specs_index无行，47f55abd有意裁撤 — 转文档卫生（CHALLENGED#10）
- [H][90] connectors/grok_bot/connector.ts:134 — 401不触发oauth_refresh — catch走failed不throw — 修复：401/403 throw
- [H][90] schemas/plugin-metadata.schema.json:175 — 双schema分叉 — 修复：收口+双向safeParse测试
- [H][90] src/shared/schemas/plugin-output.ts:107 — pluginResultSchema死契约零消费 — 修复：加校验或删
- [H][95→M] tests/…grok_bot_connector.test.ts:67 — 改测迁就 — 47f55abd/d86219e0行为测试同改，已声明变更 — 残留裁撤未记decisions，转注记（CHALLENGED#11）
- [H][95→L] src/renderer/views/PopupView.tsx:591 — 翻转Bug — 仅Upcoming卡（provider默认展开一致），首击无变化 — 独立toggle（CHALLENGED收窄#12）
- [H][90→L] connectors/muse/connector.ts:37 — 硬编码Action — 可用性债非安全（CHALLENGED#13）
- [H][90] docs/blueprint/conventions.md:139 — grok_bot自动刷新规范脱节 — 无timer/reconcile — 修复：实现或改文档为仅401即时
- [H][90] src/main/index.ts:1 / server.ts:1 / token-stats-store.ts:1 — 上帝文件1655/2052/1980行 — 修复：拆bootstrap/routes/records-rollup-dashboard
- [H][90] connectors/muse/connector.ts:37 — RSC指纹+account_id=default collapse — 修复：抽muse_rsc+manifest parameters

门禁/测试：

- [H][85] package.json:36 — check缺test致改测漏网 — 修复：check追加test

## Medium / Low / Info（建议，按置信排序）

完整192条去重明细见本目录 bundle_p\*.md + 下方聚合表（aggregate.py产出保留在git历史，本报告覆盖为详细版，bundle为溯源真相源）：

- Medium 86：metadata绕过变体、verifier进query、preload分权、sender检查、JWT伪造、muse重登风暴、files TOCTOU、日志脱敏、control DoS、CRLF、重定向跟随、WPAD、accountLabel、secretParamKeys漏键、icacls欺骗、canonical大小写、symlink list、muse 0%误报、opencode limit0、window映射、NaN阈值、PkceForm重入、web logout假成功、cookieNames漂移、preload满权、Web桩分叉、错误码枚举、参数上限、auto-seed breaking、as堆叠、薄包装、SELECT\*、optionality、preload三栈、perform_request泥团、web bridge消息链、provider-usage依恋、CPA副本、AddAccount扇出、三表重复、cruiser不足、knip无效、AccountKey偏执、post_raw投机、proxy宽正则、mock阈值、IPC伪交互、popup存在性、checksum弱、muse分支、并发不等式、时序race、覆盖率15%、60s超时、README三值、handoff滞后、AGENTS幽灵、AC缺deploy、open_external失败、轮询硬编码、refresh单次、服务端verbatim、timeout无界、并发孤儿、双码不一致、15s一刀切、错误体黑洞、probe空成功、多头首胜、batch无感知、LOCK硬编码、force绕锁、连接错正则、max_attempts漂移、裸sleep、逐条insert、kimi purge非原子、trend无界、prune阻塞、日志配额硬编码、写失败静默、export ENOENT、JWT空吞、RSC空吞、percent缺省0、orgs[0]、Pkce无超时、手动零校验、保存吞错等
- Low 58：Math.random uuid、instance_id可预测、CSP缺指令、connect-src过宽、CRLF长度、org错位、外开确认、Icon innerHTML、openExternal allowlist、__proto__、checksum位移、logout串行、timeout Infinity、占位epoch、NaN时间、local_cli空实例、spinner自排程、background双启动、SOCKS丢弃、auto-seed抖动、超时0、optionality碎片、env示例、开放命名空间、vault串行、build_params串行、indexOf排序、三遍遍历、On2排序、zod千次、script击穿、cooldown泄漏、RSC split、lodash、reduce计时、tick整树、lodash幽灵、文件名混用、tests镜像、导入面导出、空catch、顶层丢stack、必败重试、扩界难观测、关机拖延、半stale、负值语义、配额、源缺失、脏token无日志、cancel空吞、表单通用错、空白备注、脏连接、list上限、多值头、4xx重试、Abort脆弱等
- Info 9：CLIENT_ID指纹、lodash污染面、SQL复核、token约束缺失、Grok薄包装、oauth工厂、Icon三表、utils薄包装、tasks归档健康/auto-seed健康

聚合去重表（192条，Severity×Confidence排序，aggregate.py生成，bundle为源）：
见 git history 本文件上一版本（aggregate原始输出）与 bundle_p\*.md；本报告以 bundle 为准，聚合计数 C/H/M/L/Info=2/37/86/58/9。

## Spec Compliance

- t507 spec AC-001双指标 vs 实现单weekly：归档spec过期（47f55abd有意裁撤ondemand），现行specs_index无grok_bot行 → 转文档卫生，不作运行时High；需补decision+修订归档AC。
- t507 AC-003 401即时换票：脚本catch走failed不throw，refresh-service oauth_refresh分支够不着 → 真断裂，须修脚本401/403 throw。
- t508 cookieNames 4键 vs 实现1键：c960722d有意收窄防误关窗，spec未更新 → 更新spec。
- conventions自动刷新/reconcile/rotation/串行 vs grok_bot无timer：文档承诺>实现 → 实现或改文档为仅401即时。
- specs_index无t507/t508/t492/commandcode行，handoff滞后08-16：状态权威缺失 → 补handoff+specs_index。
- AC可自动测试声明虚高（浏览器拉起/真网全mock）：加[deploy]人工项。
- schemas双源无drift门禁、probe/observe术语分裂：加export --check+统一术语。

## Strengths

- refresh-service t039/t155/t172/t492集成测试真实（run_connector+真sqlite+真http），auto-seed sentinel/tombstone锁定正确，add_account 900行网关回退细致。
- net-client安全边界完整（assert_safe_host+origin越界+auth收敛+1MB截断），observation latest去重+delete_dup+prune保一行有界（证伪stale无界）。
- connectors全snake一致，tasks归档506项健康，tsconfig noUnusedLocals/unreachable false，无大块注释代码。
- ProviderCard memo+overview useMemo，echarts core动态导入，use-now-tick hidden暂停，transpile mtime缓存。

## Appendix — Traceability

- 定目标：用户“当前所有文档代码文件名配置目录结构等等全部”→全仓；intent无spec链接，targets=全仓+diff43文件。
- 确定性预处理：bundle.py --base origin/main → files 43/bundles ~20（origin/main本地无ref，改用本地增量+现状）；白名单扩展名，排除tests/dist/vendor/lock/minified/二进制；规则ts_js首命中。
- 规模判定：src 750 TS + docs 2943，超阈值 → 7视角并行（Task ses_f29…x7），互不可见，全量报零漏报。
- 7视角输出：bundle_p1_security.md(40条)/p2_correctness(28)/p3_contract(18)/p4_perf(26)/p5_arch(30)/p6_robust(51)/p7_testdoc(25)。
- 交叉验证：Task ses_f29ea058… falsify 15条Critical/High → 12 AGREE（7降级）+3 CHALLENGED（#5/#10/#11）+收窄2（#12/#13/#14）；CHALLENGED不删只降置信。
- 聚合：aggregate.py → 192 deduped C2/H37/M86/L58/I9，Verdict BLOCK；本文件为详细版覆盖，bundle为溯源源。
- 证据抽查：server.ts:750,1283,1967-2001 grep确认0.0.0.0+check_auth位置；refresh-service.ts:587-609确认race无catch；HEAD 326e88b6，log -5确认t507/t508增量。
- 未跑validation：typecheck/lint/test/build均未执行（只读审查+用户未授权）；命令/管理端/知识库操作未记录；无密钥记录。
- 假阳性清单：预存问题不计分；lint/tsc可抓不计；未改行除Critical安全不计；@review-ok无。
- 参考：skills_mine/intensive-review/skill.md §1-§6；scripts/bundle.py, aggregate.py, prepare_outdir.py；architecture.md §6自认（vm非边界/endpoint重定向/无SHA清单）；decisions 026/034；conventions命名/测试章。
