# session 交互登录接受任意 HTTPS

- 来源：Grok 全仓评审（2026-08-11）
- 内容：Grok Issue 8：session.login 仅校验 HTTPS，可指攻击者站点；cookie 登录已有 loginDomains 白名单；交互登录建议复用
- 处理：不办
- 暂搁：安全架构改进，需用户决策方向（loginDomains 复用 / 平台密钥库 / 进程隔离），暂搁评估
