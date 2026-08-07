/**
 * 会话摘要头部读取辅助（t255）。
 *
 * 摘要提取只需首条 user 消息，之前却整文件 read。改为限量头部读取：
 * 单个文件最多读 max_bytes（64KB）字节，与文件总大小解耦。
 *
 * 处理两个边界：
 * - 截断落多字节字符中间时用 StringDecoder 丢弃残缺尾字节，避免产出 U+FFFD。
 * - 若窗口末尾落在某 JSONL 行中间，补读该行剩余部分到下一个换行符，
 *   保证调用方逐行解析时不会因残缺行漏掉首条 user（t255 f001）。
 *
 * 固有边界：单条 JSONL 行超过 READ_CAP（64KB + 4KB）时无法完整读入（限量读取
 * 与整文件读的本质差异）。真实会话首条 user 行远小于此（spike s020 采样
 * 100% 在 64KB 内），超限单行回退为空摘要，属接受取舍，见 spec 风险节。
 */
import { openSync, readSync, closeSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

export const SUMMARY_HEAD_BYTES = 64 * 1024;

/** 读窗口 + 补全末行的最大总字节数（窗口 + 补读余量）。 */
export const READ_CAP = SUMMARY_HEAD_BYTES + 4096;

/** 只读文件前部为 utf-8 字符串；文件不存在/读取失败返回 ""。 */
export function read_head(file: string, max_bytes = SUMMARY_HEAD_BYTES): string {
    let fd: number;
    try {
        fd = openSync(file, "r");
    } catch {
        return "";
    }
    try {
        const buf = Buffer.alloc(READ_CAP);
        const n = readSync(fd, buf, 0, READ_CAP, 0);
        const raw = buf.subarray(0, n);

        // 找窗口内最后一个换行符：窗口内的完整行保留；其后字节为残缺末行。
        const window_end = Math.min(max_bytes, raw.length);
        let last_nl = raw.subarray(0, window_end).lastIndexOf(0x0a);
        // 补全残缺末行：从 last_nl 后继续读，直到遇换行或文件尾。
        let end = window_end;
        if (last_nl >= 0 && end < raw.length) {
            const rest_nl = raw.subarray(end).indexOf(0x0a);
            if (rest_nl >= 0) {
                end = end + rest_nl + 1;
            } else {
                end = raw.length;
            }
        } else if (last_nl < 0) {
            last_nl = -1;
        }

        // StringDecoder 丢弃残缺尾字节，避免多字节 utf-8 截断产出 U+FFFD。
        const decoder = new StringDecoder("utf8");
        return decoder.write(raw.subarray(0, end));
    } catch {
        return "";
    } finally {
        closeSync(fd);
    }
}
