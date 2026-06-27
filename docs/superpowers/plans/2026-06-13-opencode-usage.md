# OpenCode Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode Web-session usage collection that shows rolling, weekly, and monthly usage percentages.

**Architecture:** Reuse the existing bundled plugin architecture and MiMo-style Cookie login. Add a minimal text-response path to the plugin SDK because OpenCode returns SolidJS server-function payloads as `text/javascript`, then add one `opencode` plugin that discovers current SolidJS server-reference IDs from OpenCode page scripts before calling the usage server function.

**Tech Stack:** Electron, React, TypeScript, Vitest, bundled plugin SDK, undici HTTP client.

---

See original plan in main checkout if needed; this worktree copy is a marker for implementation context. The controller will dispatch subagents with full task text from the plan.
