const USAGE_COLORS = [
    "#5B8CFF", // 1 主蓝
    "#8B72F8", // 2 主紫
    "#46C7C7", // 3 主青
    "#7EA2FF", // 4 扩展蓝
    "#A18CFF", // 5 扩展紫
    "#72D4D1", // 6 扩展青
    "#9CB8FF", // 7 浅蓝灰
    "#B6A7FF", // 8 浅紫灰
];

export function usage_color(idx: number): string {
    const n = USAGE_COLORS.length;
    return USAGE_COLORS[((idx % n) + n) % n];
}
