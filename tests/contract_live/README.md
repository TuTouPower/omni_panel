# Live API Contract Tests

These tests hit **real external APIs** with real credentials. They are excluded
from `pnpm test` so CI never runs them by accident.

## Run

```bash
pnpm test:contract:live
```

Or run all tests (unit + integration + live contract):

```bash
pnpm test:full
```

## Required Environment Variables

| Variable           | Plugin                | Notes                                               |
| ------------------ | --------------------- | --------------------------------------------------- |
| `DEEPSEEK_API_KEY` | deepseek-usage-plugin | DeepSeek API key                                    |
| `GLM_API_KEY`      | glm-usage-plugin      | ZhipuAI API key                                     |
| `MINIMAX_API_KEY`  | minimax-usage-plugin  | MiniMax API key                                     |
| `TAVILY_API_KEY`   | tavily-usage-plugin   | Tavily API key                                      |
| `CPA_MGMT_KEY`     | cpa-usage-plugin      | CPA-Manager bearer token                            |
| `CPA_MGMT_URL`     | cpa-usage-plugin      | CPA-Manager base URL (e.g. `http://localhost:8080`) |

If a variable is not set the corresponding test is **skipped** (not failed).

## Example

```bash
DEEPSEEK_API_KEY=sk-xxx TAVILY_API_KEY=tvly-yyy pnpm test:contract:live
```

## What Is Asserted

Only the **response shape** is validated -- no specific values (amounts, names,
etc.) are asserted because they change over time. The tests verify:

- Exit code is 0
- `updatedAt` is a valid ISO 8601 string
- `items` is an array
- Each item has: `id` (string), `name` (string), `used` (number),
  `limit` (number), `displayStyle` ("percent" | "ratio"),
  `status` ("normal" | "warning" | "critical" | "unknown")
