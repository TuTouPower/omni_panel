# Task spec

## 背景

t065 I24 遗留：启用 7 eslint 插件 recommended 分批修。

## 范围

- 启用 security/sonarjs/unicorn/jsx-a11y/react/n/promise recommended（eslint.config.ts），分批修 lint 错。

## 验收标准

- [ ] 7 插件 recommended 启用；lint 分级（warning 起步或逐插件）；knip 同步。

## 依赖与约束

- 会爆千错，分批修；可能需 --max-warnings 放宽过渡。
