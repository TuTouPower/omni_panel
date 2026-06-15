# Refresh Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make popup refresh buttons visibly spin for the full time their refresh request is pending, for both refresh-all and provider-level refresh.

**Architecture:** Keep the change local to `PopupView` and drive button animation from real pending state instead of timer-based fake delay. Use one boolean for refresh-all and one `Set<UsageProvider>` for provider-level refresh so each button reflects only its own in-flight work.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, Electron renderer

---

## File Map

- Modify: `docs/TEST.md`
    - Keep the testing rule explicit: refresh interactions must show loading while pending.
- Modify: `tests/smoke/renderer-smoke.test.tsx`
    - Add renderer-level TDD coverage for refresh-all spinner and provider spinner.
- Modify: `tests/smoke/setup.ts`
    - Allow refresh mocks to stay pending so the tests can assert the intermediate loading state.
- Modify: `src/renderer/views/PopupView.tsx`
    - Remove timer-based refresh reset and bind UI to real async pending state.
- Modify: `tests/user_e2e/pages/popup_page.ts`
    - Add stable helpers for popup refresh button locators if needed by the manual-validation-oriented E2E spec.
- Modify: `tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`
    - Extend popup behavior coverage to assert the UI still behaves correctly around manual refresh.

---

### Task 1: Update the testing doc first

**Files:**

- Modify: `docs/TEST.md:40-49`

- [ ] **Step 1: Update the refresh expectation in the doc**

Replace the existing bullet with this exact text so the doc reflects the required behavior before test/code work:

```md
- 按钮点击是否触发实际行为（刷新 → 立即进入加载/旋转中 → 数据更新或失败后结束加载）。
```

- [ ] **Step 2: Verify the doc change**

Read: `docs/TEST.md`
Expected: the refresh bullet explicitly says the UI must enter loading/spinning immediately and stop after success or failure.

- [ ] **Step 3: Commit the doc-only change**

```bash
git add docs/TEST.md
git commit -m "docs: clarify refresh loading behavior"
```

Expected: one commit containing only the doc change.

---

### Task 2: Write the failing renderer test for refresh-all spinner

**Files:**

- Modify: `tests/smoke/renderer-smoke.test.tsx`
- Modify: `tests/smoke/setup.ts`
- Test: `tests/smoke/renderer-smoke.test.tsx`

- [ ] **Step 1: Add a controllable promise helper inside the smoke test file**

Insert this helper near the imports in `tests/smoke/renderer-smoke.test.tsx`:

```ts
function deferred_promise<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
```

- [ ] **Step 2: Write the failing refresh-all spinner test**

Add this test in the `PopupView` smoke suite after the existing refresh-click test:

```ts
it("keeps refresh-all button spinning while refreshAll is pending", async () => {
    const user = userEvent.setup();
    const api = getMockApi();
    const refresh_all_deferred = deferred_promise<void>();
    api.plugin.refreshAll.mockReturnValueOnce(refresh_all_deferred.promise);

    render(<App />);

    const button = await screen.findByTitle("刷新全部");
    expect(button).not.toHaveClass("spinning");

    await user.click(button);

    expect(api.plugin.refreshAll).toHaveBeenCalledTimes(1);
    expect(button).toHaveClass("spinning");

    refresh_all_deferred.resolve(undefined);

    await waitFor(() => {
        expect(button).not.toHaveClass("spinning");
    });
});
```

- [ ] **Step 3: Run the single renderer smoke test to verify RED**

Run:

```bash
npx vitest run tests/smoke/renderer-smoke.test.tsx -t "keeps refresh-all button spinning while refreshAll is pending"
```

Expected: FAIL because the current implementation clears state on a timer instead of keeping the button spinning exactly while the promise is pending.

- [ ] **Step 4: If the test passes unexpectedly, tighten the assertion before code changes**

Use this stronger interim assertion block inside the same test, replacing the final assertions if needed:

```ts
expect(button).toHaveClass("spinning");
await Promise.resolve();
expect(button).toHaveClass("spinning");
```

Expected: the test must be genuinely red before production code changes.

- [ ] **Step 5: Commit the failing test setup**

```bash
git add tests/smoke/renderer-smoke.test.tsx tests/smoke/setup.ts
git commit -m "test: cover pending refresh-all spinner"
```

Expected: commit contains only test changes and the test is known-red at this point.

---

### Task 3: Write the failing renderer test for provider refresh spinner

**Files:**

- Modify: `tests/smoke/renderer-smoke.test.tsx`
- Test: `tests/smoke/renderer-smoke.test.tsx`

- [ ] **Step 1: Add the provider-level failing test**

Append this test after the refresh-all spinner test:

```ts
it("keeps provider refresh button spinning while provider refresh is pending", async () => {
    const user = userEvent.setup();
    const api = getMockApi();
    const provider_refresh_deferred = deferred_promise<void>();
    api.plugin.refresh.mockReturnValueOnce(provider_refresh_deferred.promise);

    render(<App />);

    const deepseek_tab = await screen.findByRole("button", { name: "DeepSeek" });
    await user.click(deepseek_tab);

    const button = await screen.findByRole("button", { name: "刷新 DeepSeek" });
    expect(button).not.toHaveClass("spinning");

    await user.click(button);

    expect(api.plugin.refresh).toHaveBeenCalledWith("deepseek");
    expect(button).toHaveClass("spinning");

    provider_refresh_deferred.resolve(undefined);

    await waitFor(() => {
        expect(button).not.toHaveClass("spinning");
    });
});
```

- [ ] **Step 2: Run the single provider test to verify RED**

Run:

```bash
npx vitest run tests/smoke/renderer-smoke.test.tsx -t "keeps provider refresh button spinning while provider refresh is pending"
```

Expected: FAIL because provider refresh currently does not maintain per-provider pending state.

- [ ] **Step 3: Run both new smoke tests together**

Run:

```bash
npx vitest run tests/smoke/renderer-smoke.test.tsx -t "spinning while"
```

Expected: both new tests fail for the expected reason, not due to selector mistakes or unrelated render errors.

- [ ] **Step 4: Commit the second failing test**

```bash
git add tests/smoke/renderer-smoke.test.tsx
git commit -m "test: cover pending provider refresh spinner"
```

Expected: one commit containing only the new provider-level failing test.

---

### Task 4: Implement minimal popup pending-state logic

**Files:**

- Modify: `src/renderer/views/PopupView.tsx`
- Test: `tests/smoke/renderer-smoke.test.tsx`

- [ ] **Step 1: Replace timer-based refresh state with real pending state**

In `src/renderer/views/PopupView.tsx`, replace the existing refresh state declarations:

```ts
const [refreshing, setRefreshing] = useState(false);
```

with:

```ts
const [refreshing, setRefreshing] = useState(false);
const [refreshing_providers, set_refreshing_providers] = useState<Set<UsageProvider>>(new Set());
```

- [ ] **Step 2: Delete the obsolete timeout ref and cleanup effect**

Remove this block entirely:

```ts
const refresh_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
    return () => {
        if (refresh_timeout_ref.current !== null) {
            clearTimeout(refresh_timeout_ref.current);
        }
    };
}, []);
```

Expected: no timer remains in popup refresh handling.

- [ ] **Step 3: Rewrite `handleRefreshAll` to await the real promise**

Replace the existing function with:

```ts
const handleRefreshAll = () => {
    if (refreshing) return;
    setRefreshing(true);
    void refreshAll()
        .catch((err: unknown) => {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `刷新全部失败: ${errorMessage(err)}`,
            });
        })
        .finally(() => {
            setRefreshing(false);
        });
};
```

Expected: the button spins for exactly the pending lifetime of `refreshAll()`.

- [ ] **Step 4: Rewrite `refreshProvider` to track per-provider pending state**

Replace the existing provider refresh function with:

```ts
const refreshProvider = (provider: UsageProvider) => {
    if (refreshing_providers.has(provider)) return;

    const connectors = plugins.filter(
        (connector) => connector.enabled && connector.activeProviders.includes(provider),
    );

    set_refreshing_providers((prev) => new Set(prev).add(provider));

    void Promise.all(
        connectors.map((connector) =>
            window.usageboard.connector.refresh(connector.sourceInstanceId),
        ),
    )
        .catch((err: unknown) => {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `刷新 ${provider} 失败: ${errorMessage(err)}`,
            });
        })
        .finally(() => {
            set_refreshing_providers((prev) => {
                const next = new Set(prev);
                next.delete(provider);
                return next;
            });
        });
};
```

Expected: clicking a provider refresh button adds only that provider to the pending set and removes it after settle.

- [ ] **Step 5: Keep the render wiring explicit and minimal**

Ensure the render path still passes the pending set exactly like this:

```ts
refreshingProviders={is_live ? refreshing_providers : undefined}
```

Expected: `ProviderOverview` and `ProviderCard` continue to read the same prop, but it now reflects real pending state.

- [ ] **Step 6: Run the two new smoke tests to verify GREEN**

Run:

```bash
npx vitest run tests/smoke/renderer-smoke.test.tsx -t "spinning while"
```

Expected: PASS for both new tests.

- [ ] **Step 7: Commit the minimal implementation**

```bash
git add src/renderer/views/PopupView.tsx
git commit -m "feat: bind popup refresh spinners to pending state"
```

Expected: commit contains only the popup implementation change.

---

### Task 5: Add one regression test for state cleanup after user refresh

**Files:**

- Modify: `tests/user_e2e/pages/popup_page.ts`
- Modify: `tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`
- Test: `tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`

- [ ] **Step 1: Add popup page helpers for spinner assertions**

In `tests/user_e2e/pages/popup_page.ts`, add these methods:

```ts
refresh_all_button() {
    return this.live.getByTitle("刷新全部");
}

provider_refresh_button(label: string) {
    return this.live.getByRole("button", { name: `刷新 ${label}` });
}
```

- [ ] **Step 2: Add a UI regression test around provider refresh interaction**

In `tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`, append this test:

```ts
test("manual refresh keeps popup interactive and clears spinner after completion", async ({
    omni,
}) => {
    const page = await omni.app.firstWindow();
    const popup = new PopupPage(page);
    await popup.waitReady();
    await page.waitForTimeout(5000);

    const live = popup.root();
    await live.getByRole("button", { name: /^Claude$/ }).click();

    const refresh_button = popup.provider_refresh_button("Claude");
    await refresh_button.click();

    await expect(refresh_button).not.toHaveClass(/spinning/, { timeout: 10_000 });
    await expect(live.getByRole("button", { name: /折叠 Refresh Account A/ })).toBeVisible();
});
```

This does not prove the pending middle frame in packaged runtime, but it guards that the button returns to idle and the popup remains usable after manual refresh.

- [ ] **Step 3: Run the focused E2E spec**

Run:

```bash
pnpm test:e2e -- popup_refresh_state_reset.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the regression coverage**

```bash
git add tests/user_e2e/pages/popup_page.ts tests/user_e2e/specs/popup_refresh_state_reset.spec.ts
git commit -m "test: cover popup refresh spinner reset"
```

Expected: one commit for the E2E regression addition.

---

### Task 6: Run project verification and manual UI validation

**Files:**

- Modify: none
- Test: `tests/smoke/renderer-smoke.test.tsx`
- Test: `tests/user_e2e/specs/popup_refresh_state_reset.spec.ts`
- Test: full project suite via `pnpm test`

- [ ] **Step 1: Run the targeted smoke tests again**

Run:

```bash
npx vitest run tests/smoke/renderer-smoke.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the targeted popup E2E spec again**

Run:

```bash
pnpm test:e2e -- popup_refresh_state_reset.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run the required full test suite**

Run:

```bash
pnpm test
```

Expected: PASS, or if there is a pre-existing unrelated failure, capture the exact failing test and do not claim full success.

- [ ] **Step 4: Manually verify the popup UI**

Run the app and check both manual flows:

```bash
pnpm dev
```

Manual checks:

1. Click the title-bar “刷新全部” button and confirm it starts rotating immediately.
2. While the refresh is still in progress, confirm the title-bar icon is still rotating.
3. After the refresh finishes or fails, confirm the rotation stops.
4. Open a provider tab, click its “刷新 <provider>” button, confirm that button rotates immediately.
5. While that provider refresh is still in progress, confirm only that provider button shows the pending state.
6. After the provider refresh finishes or fails, confirm the rotation stops and the page remains interactive.

- [ ] **Step 5: Commit verification-adjacent test updates if any were needed**

If manual verification required no code changes, skip commit.
If a tiny verification-only selector or test fix was required, commit it separately:

```bash
git add <exact-files>
git commit -m "test: stabilize popup refresh verification"
```

---

## Self-Review Checklist

- Spec coverage: covered doc update, refresh-all spinner, provider spinner, and verification.
- No placeholders: every task includes concrete file paths, code snippets, and commands.
- Type consistency: uses existing `UsageProvider`, existing `spinning` class, and existing `refreshingProviders` prop name.
