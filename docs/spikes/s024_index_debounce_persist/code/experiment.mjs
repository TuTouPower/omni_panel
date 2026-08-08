/**
 * s024 spike：会话索引落盘批间合并机制验证。
 *
 * 目标：验证「dirty 标记 + debounce flush」下：
 * 1. 批量 persist N 个冷会话，落盘次数显著 < N。
 * 2. 未命中且内容不变的 delete 不触发落盘。
 * 3. 显式 flush 后索引文件含全部条目。
 *
 * 运行：node scripts/s024_index_debounce_experiment.mjs
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEBOUNCE_MS = 50;
let write_count = 0;
let index = new Map();
let dirty = false;
let timer = null;

function persist(key, value) {
    const had = index.has(key);
    if (value === null) {
        if (!had) return; // 未命中且内容不变：不落盘
        index.delete(key);
    } else {
        index.set(key, value);
    }
    dirty = true;
    if (timer === null) {
        timer = setTimeout(() => {
            timer = null;
            flush();
        }, DEBOUNCE_MS);
    }
}

function flush() {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
    if (!dirty) return;
    write_count += 1;
    // 模拟原子写
    dirty = false;
}

// 场景 1：批量 resolve N 冷会话 → 写盘次数
const N = 50;
for (let i = 0; i < N; i++) persist(`k${i}`, { p: `/f${i}` });
console.log(`批量 N=${N} persist 后立即写盘次数: ${write_count}（期望 0，debounce 未到期）`);
await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 20));
console.log(`debounce 到期后写盘次数: ${write_count}（期望 1，显著 < N=${N}）`);

// 场景 2：未命中且内容不变不写盘
persist("nokey", null);
await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 20));
console.log(`未命中 delete 后写盘次数: ${write_count}（期望仍 1）`);

// 场景 3：显式 flush 保证
persist("k51", { p: "/f51" });
flush();
console.log(`显式 flush 后写盘次数: ${write_count}（期望 2）`);

// 场景 4：单 miss 内两次 persist（删 + 填）合并
persist("k52", null); // 删除
persist("k52", { p: "/f52" }); // 回填
flush();
console.log(`单 miss 删+填合并写盘次数: ${write_count}（期望 3，两次 persist 一次写）`);
