# 概览设计

_Started 2026-06-04 13:15 UTC_

---

## User

平均两个字换成概览，所有地方都换

## Assistant

_[tool: grep]_

_[tool: read_file]_

I'll replace 平均 with 概览 everywhere. Let me check the exact occurrences.The visible UI text is in components.jsx. Let me replace all occurrences there.

_[tool: str_replace_edit]_

Done — replaced 平均 with 概览 in all user-facing labels (the badge text, the segmented control button, and its tooltip).

