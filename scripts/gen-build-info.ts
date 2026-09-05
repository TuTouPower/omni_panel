import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo_root = resolve(__dirname, "..");
const out_path = resolve(repo_root, "src/generated/build-info.ts");

function run(cmd: string): string {
    try {
        return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    } catch (err) {
        process.stderr.write(`[gen-build-info] ${cmd} 失败，回退 "unknown": ${String(err)}\n`);
        return "unknown";
    }
}

const branch = run("git rev-parse --abbrev-ref HEAD") || "unknown";
const commit = run("git rev-parse --short HEAD") || "unknown";
const subject = run("git log -1 --pretty=%s") || "unknown";

const content = `// 自动生成，勿手改。由 scripts/gen-build-info.ts 在构建期覆写。
export const BUILD_INFO = {
    branch: ${JSON.stringify(branch)},
    commit: ${JSON.stringify(commit)},
    subject: ${JSON.stringify(subject)},
} as const;
`;

// p221: 新鲜 worktree 下 src/generated/ 不存在（gitignore），先建目录。
mkdirSync(dirname(out_path), { recursive: true });
writeFileSync(out_path, content);
console.log(`build-info: ${branch}@${commit} ${subject}`);
