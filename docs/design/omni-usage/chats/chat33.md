# 账号设计移除Key

_Started 2026-06-06 11:54 UTC_

---

## User

去掉账号的Key，没有这种东西。没有任何一个账号需要在后面显示他的Key

## Assistant

_[tool: grep]_

_[tool: list_files]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

Found it — the account detail row renders `<span className="ai-key">`. I'll remove that line.

_[tool: str_replace_edit]_

_[tool: grep]_

Now let me check the CSS so the row layout still looks right without the key element.

_[tool: grep]_

_[tool: read_file]_

The layout holds — `.ai-time` uses `margin-left: auto`. Let me remove the now-unused `.ai-key` CSS rule.

_[tool: str_replace_edit]_

_[tool: done]_

Done. Removed the masked Key from the account detail rows — accounts now show just the name and last-updated time. Also cleaned up the unused `.ai-key` style.

