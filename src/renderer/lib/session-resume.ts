/** t324 会话来源 → 续接命令；未知来源返回 null（点击 session id 无效果）。t326 提取为工作台/会话库共享。 */
export function resume_command(source: string, session_id: string): string | null {
    switch (source) {
        case "claude_code":
            return `claude --resume ${session_id}`;
        case "kimi_code":
            return `kimi -r ${session_id}`;
        case "grok":
            return `grok --resume ${session_id}`;
        case "opencode":
            return `opencode -s ${session_id}`;
        default:
            return null;
    }
}
