/**
 * s041 spike probe：验证「卡窗切片」从多服务列表页分离各服务字段的假设。
 *
 * 假设（链接在卡/行尾）：第 k 个详情链接之前的窗口 (link_{k-1}, link_k] 装的是
 * 第 k 个服务自己的 名称/用量/日期。链接位置提前（link-first）时窗口错位，
 * 期望解析失败 → 生产走 HTTP 逐服务详情页兜底（不静默）。
 *
 * 抽取函数复刻 connectors/flowercloud/connector.ts 的 extract_from_html 正则。
 * 运行：node docs/spikes/s041_flowercloud_multi_service_dom/code/probe.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function service_ids_with_positions(html) {
    const ids = [];
    const re = /clientarea\.php\?action=productdetails(?:&amp;|&)id=(\d+)/gi;
    for (const m of html.matchAll(re)) {
        ids.push({ id: m[1], end: m.index + m[0].length, start: m.index });
    }
    // 按 id 去重（保留首次出现）。
    const seen = new Set();
    return ids.filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)));
}

function parse_to_gb(value, unit) {
    const u = unit.toUpperCase();
    if (u.includes("TB") || u.includes("TIB")) return Math.round(value * 1024 * 100) / 100;
    if (u.includes("GB") || u.includes("GIB")) return Math.round(value * 100) / 100;
    if (u.includes("MB") || u.includes("MIB")) return Math.round((value / 1024) * 100) / 100;
    if (u.includes("KB") || u.includes("KIB"))
        return Math.round((value / (1024 * 1024)) * 100) / 100;
    return value;
}

function extract_window(window_html) {
    let product_name = null;
    const product_match =
        /(?:Global Acceleration\s+(?:Lite|Plus|Max|Air|Enterprise[A-Za-z\s]*))/i.exec(
            window_html,
        ) ??
        /(?:产品|服务|套餐|Product\/Service)[^:]*[:：]\s*<[^>]*>([^<]+)<\/[^>]*>/i.exec(
            window_html,
        ) ??
        /(?:产品|服务|套餐|Product\/Service)[^:]*[:：]\s*([^\r\n<]+)/i.exec(window_html) ??
        /class="product-name">([^<]+)</i.exec(window_html);
    if (product_match?.[1]) product_name = product_match[1].trim();
    else if (product_match?.[0]) product_name = product_match[0].trim();

    let used_gb = null;
    let limit_gb = null;
    const combined =
        /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)\s*(?:\/|of|共|，共)\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)/i.exec(
            window_html,
        );
    if (combined?.[1] && combined[2] && combined[3] && combined[4]) {
        used_gb = parse_to_gb(parseFloat(combined[1]), combined[2]);
        limit_gb = parse_to_gb(parseFloat(combined[3]), combined[4]);
    }

    let reset_at = null;
    const date_match =
        /(?:下次重置日|下次付款日期|下次到期日|Next Due Date|nextduedate|重置日|到期日)[^<>{}:：]*[:：]\s*(?:<[^>]*>)?(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/i.exec(
            window_html,
        );
    if (date_match?.[1]) {
        const normalized = date_match[1].replace(/[年月/]/g, "-").replace(/日/g, "");
        const parsed = Date.parse(`${normalized}T00:00:00+08:00`);
        if (Number.isFinite(parsed)) reset_at = parsed;
    }
    return { product_name, used_gb, limit_gb, reset_at };
}

function card_window_extract(html) {
    const entries = service_ids_with_positions(html);
    return entries.map((entry, index) => {
        const from = index === 0 ? 0 : entries[index - 1].end;
        const window_html = html.slice(from, entry.end);
        return { id: entry.id, ...extract_window(window_html) };
    });
}

let failures = 0;
function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    console.log(
        `${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` != ${JSON.stringify(expected)}`}`,
    );
}

// 1. 真实样本同构的三服务卡列表（链接卡尾）
const multi = card_window_extract(readFileSync(join(HERE, "clientarea_multi_sample.html"), "utf8"));
check(
    "multi/ids",
    multi.map((s) => s.id),
    ["8848", "8849", "8850"],
);
check(
    "multi/names",
    multi.map((s) => s.product_name),
    ["Global Acceleration Lite", "Global Acceleration Plus", "Global Acceleration Max"],
);
check(
    "multi/usage",
    multi.map((s) => [s.used_gb, s.limit_gb]),
    [
        [34.56, 150],
        [77.1, 400],
        [1228.8, 2048],
    ],
);
check(
    "multi/dates",
    multi.map((s) => s.reset_at),
    [
        Date.parse("2026-10-18T00:00:00+08:00"),
        Date.parse("2026-11-05T00:00:00+08:00"),
        Date.parse("2026-10-02T00:00:00+08:00"),
    ],
);

// 2. WHMCS 默认表格（链接行尾）
const table = card_window_extract(readFileSync(join(HERE, "whmcs_table_sample.html"), "utf8"));
check(
    "table/ids",
    table.map((s) => s.id),
    ["9901", "9902"],
);
check(
    "table/usage",
    table.map((s) => [s.used_gb, s.limit_gb]),
    [
        [12, 150],
        [540, 1000],
    ],
);
check(
    "table/names",
    table.map((s) => s.product_name),
    ["Global Acceleration Lite", "Global Acceleration Enterprise"],
);

// 3. 反例：链接在卡首（结构错位）——窗口错位导致 7701 缺失、7702 被错配 7701 的
//    数据（「hit」是错误数据）。生产规则由此确定：任一窗口不完整 → 丢弃全部窗口
//    结果、逐服务 HTTP 详情页补数；补数失败逐服务 report_failed_account，绝不静默。
const link_first = `<div class="card"><a href="clientarea.php?action=productdetails&amp;id=7701">管理</a>
    <span class="product-name">Global Acceleration Lite</span>
    <p>已用流量：10.00 GB / 150.00 GB</p></div>
<div class="card"><a href="clientarea.php?action=productdetails&amp;id=7702">管理</a>
    <span class="product-name">Global Acceleration Plus</span>
    <p>已用流量：20.00 GB / 400.00 GB</p></div>`;
const misaligned = card_window_extract(link_first);
check(
    "link-first/ids",
    misaligned.map((s) => s.id),
    ["7701", "7702"],
);
check(
    "link-first/first-window-miss (触发全量 HTTP 兜底)",
    misaligned.map((s) => (s.used_gb === null ? "miss" : "hit")),
    ["miss", "hit"],
);
check(
    "link-first/hit-is-misattributed (7702 带到 7701 的 10/150，必须被丢弃)",
    [misaligned[1]?.used_gb, misaligned[1]?.limit_gb],
    [10, 150],
);

console.log(failures === 0 ? "\nALL PASS" : `\n${String(failures)} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
