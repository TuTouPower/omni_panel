function pad2(value: number): string {
    return value.toString().padStart(2, "0");
}

function pad3(value: number): string {
    return value.toString().padStart(3, "0");
}

/** 返回系统本地时区的 YYYY-MM-DD 字符串（日志文件名/导出默认名用）。 */
export function get_local_date_string(date: Date = new Date()): string {
    const year = date.getFullYear().toString().padStart(4, "0");
    return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 返回带本地时区偏移的 ISO 时间戳（如 2026-09-18T03:23:02.416+08:00）。 */
export function format_local_iso(date: Date = new Date()): string {
    const offset_min = -date.getTimezoneOffset();
    const sign = offset_min >= 0 ? "+" : "-";
    const abs = Math.abs(offset_min);
    const tz = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
    return (
        `${date.getFullYear().toString().padStart(4, "0")}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
        `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}${tz}`
    );
}
