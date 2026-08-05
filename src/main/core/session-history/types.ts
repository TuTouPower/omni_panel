/**
 * 会话历史统一消息模型（t209）。
 *
 * 四端（claude_code/opencode/kimi_code/grok）提取器输出此类型，供窗口层（t211）
 * 统一渲染。裁剪规则（需求决策 2）：仅保留 user 与 assistant 文本，剔除
 * tool_use/tool_result/system/thinking 等。
 */

export type MessageRole = "user" | "assistant";

export interface HistoryMessage {
    /** 端内稳定 id（如 claude 的 record uuid、opencode 的 part id、kimi/grok 的行序 hash）。 */
    readonly id: string;
    readonly role: MessageRole;
    readonly text: string;
    /**
     * 消息时间戳（ms epoch）。grok chat_history.jsonl 无时间字段，为 null
     * （窗口按行序展示，见 d017）。
     */
    readonly timestamp: number | null;
}

/**
 * 增量提取游标。JSONL 端用字节 offset，opencode 用 max(rowid)。
 * 全量提取后返回游标，下次增量从游标续读。
 * `pagination` 形态仅供 t210 查询分页：编码「已返回页最早消息在全量数组中的
 * 绝对下标」。提取器追加型（新消息只出现在末尾），旧下标跨追加稳定；用下标
 * 而非 message id 定位，避免空/重复 id 时 findIndex 跳到错误位置（t210_code_f005）。
 */
export type ExtractCursor =
    | { readonly kind: "byte_offset"; readonly file: string; readonly offset: number }
    | { readonly kind: "sqlite_rowid"; readonly max_rowid: number }
    | { readonly kind: "pagination"; readonly end_index: number };

export interface ExtractResult {
    readonly messages: readonly HistoryMessage[];
    readonly cursor: ExtractCursor | null;
}
