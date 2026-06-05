# Main Panel Window Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `docs/window_design.md` main panel design: tray left-click opens the main panel, whose shell is either Popup or Floating Window based on user settings.

**Architecture:** Add a focused Main-process `main_panel_controller` that owns the main panel shell lifecycle, delegates content-height reports, stores floating bounds, and responds to config changes. Keep the existing React content UI shared; only window shell behavior changes by mode.

**Tech Stack:** Electron main process, React renderer, TypeScript, Zod config schema, Vitest unit tests, Playwright user E2E.

---

## Source design

Use `docs/window_design.md` as the product source of truth.

Key accepted decisions:

- Tray left-click always means open/focus/toggle the main panel.
- The main panel shell is chosen by `mainPanelMode`:
    - `system`: macOS → Popup, Windows/Linux → Floating Window
    - `popup`: force Popup
    - `floating`: force Floating Window
- Floating Window `×` hides; it does not destroy the instance.
- Changing `mainPanelMode` in Settings applies immediately if the main panel is open.
- Switching shell does not reuse old shell bounds. The new shell uses its own placement rules.
- Floating `fixed`: user can resize width and height; content overflow scrolls.
- Floating `followContent`: user can resize width only; height follows content and clamps to 75% workArea.
- Restored `floatingBounds` must be clamped into the current workArea.

---

## File structure

Create:

- `src/main/core/main-panel/main-panel-types.ts`
    - Shared Main-process types for panel modes, height modes, bounds, platform, and shell state.
- `src/main/core/main-panel/main-panel-config.ts`
    - Resolve config + platform into effective shell mode.
- `src/main/core/main-panel/floating-bounds.ts`
    - Pure helpers for default floating placement and restoring/clamping saved bounds.
- `src/main/core/main-panel/main-panel-controller.ts`
    - Electron-facing lifecycle controller. Owns Popup/Floating windows and content-height routing.
- `tests/unit/main/main_panel_config.test.ts`
    - Tests mode resolution.
- `tests/unit/main/floating_bounds.test.ts`
    - Tests bounds restoration/clamping.
- `tests/unit/main/main_panel_controller.test.ts`
    - Tests height-report routing and hide/destroy behavior with fake windows.

Modify:

- `src/shared/types/config.ts`
    - Add `mainPanelMode`, `floatingHeightMode`, `floatingBounds`.
- `src/main/core/config/types.ts`
    - Extend Zod schema.
- `src/main/ipc/popup-ipc.ts`
    - Keep channel name, but dependency becomes “height-report sink”, not Popup-only.
- `src/shared/types/ipc.ts`
    - Add main-panel close/hide IPC channel and renderer API.
- `src/preload/index.ts`
    - Expose `main_panel.hide()` or `main_panel.close()` to Popup route.
- `src/main/index.ts`
    - Remove scattered Popup state and wire `main_panel_controller` into tray, config save callback, and E2E auto-open.
- `src/renderer/views/SettingsView.tsx`
    - Add Main Panel mode and Floating height mode controls.
- `src/renderer/views/PopupView.tsx`
    - Render Floating close button only when effective shell is floating.
- `src/renderer/styles/globals.css`
    - Add Floating-specific titlebar/action styling if needed.
- `tests/user_e2e/specs/tray_interaction.spec.ts`
    - Update Popup-only test expectations and add Floating default coverage.
- `docs/window_design.md`
    - Already updated; only touch again if implementation changes the design.

---

### Task 1: Add config fields and schema tests

**Files:**

- Modify: `src/shared/types/config.ts`
- Modify: `src/main/core/config/types.ts`
- Create: `tests/unit/main/main_panel_config.test.ts`
- Create: `src/main/core/main-panel/main-panel-types.ts`
- Create: `src/main/core/main-panel/main-panel-config.ts`

- [ ] **Step 1: Write failing tests for mode resolution**

Create `tests/unit/main/main_panel_config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolve_main_panel_mode } from "../../../src/main/core/main-panel/main-panel-config";
import type { AppConfiguration } from "../../../src/shared/types/config";

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

describe("resolve_main_panel_mode", () => {
    it("uses popup for system mode on macOS", () => {
        expect(resolve_main_panel_mode({ ...base_config, mainPanelMode: "system" }, "darwin")).toBe(
            "popup",
        );
    });

    it("uses floating for system mode on Windows", () => {
        expect(resolve_main_panel_mode({ ...base_config, mainPanelMode: "system" }, "win32")).toBe(
            "floating",
        );
    });

    it("uses floating for system mode on Linux", () => {
        expect(resolve_main_panel_mode({ ...base_config, mainPanelMode: "system" }, "linux")).toBe(
            "floating",
        );
    });

    it("defaults missing mainPanelMode to system", () => {
        expect(resolve_main_panel_mode(base_config, "win32")).toBe("floating");
    });

    it("honours explicit popup mode", () => {
        expect(resolve_main_panel_mode({ ...base_config, mainPanelMode: "popup" }, "win32")).toBe(
            "popup",
        );
    });

    it("honours explicit floating mode", () => {
        expect(
            resolve_main_panel_mode({ ...base_config, mainPanelMode: "floating" }, "darwin"),
        ).toBe("floating");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/main/main_panel_config.test.ts
```

Expected: FAIL because `src/main/core/main-panel/main-panel-config.ts` does not exist.

- [ ] **Step 3: Add shared config fields**

Modify `src/shared/types/config.ts`:

```ts
export type MainPanelMode = "system" | "popup" | "floating";
export type FloatingHeightMode = "fixed" | "followContent";

export interface FloatingBoundsConfiguration {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly displayId?: string;
}
```

Add these fields to `AppConfiguration`:

```ts
readonly mainPanelMode?: MainPanelMode;
readonly floatingHeightMode?: FloatingHeightMode;
readonly floatingBounds?: FloatingBoundsConfiguration;
```

- [ ] **Step 4: Add Zod schema fields**

Modify `src/main/core/config/types.ts`:

```ts
export const mainPanelModeSchema = z.enum(["system", "popup", "floating"]);
export const floatingHeightModeSchema = z.enum(["fixed", "followContent"]);

export const floatingBoundsSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().int().min(320),
    height: z.number().int().min(240),
    displayId: z.string().optional(),
});
```

Add to `appConfigurationSchema`:

```ts
mainPanelMode: mainPanelModeSchema.optional(),
floatingHeightMode: floatingHeightModeSchema.optional(),
floatingBounds: floatingBoundsSchema.optional(),
```

Do not add these to `DEFAULT_CONFIGURATION`; missing fields intentionally mean defaults.

- [ ] **Step 5: Add main panel type file**

Create `src/main/core/main-panel/main-panel-types.ts`:

```ts
import type { BrowserWindow, Display, Rectangle } from "electron";
import type {
    FloatingBoundsConfiguration,
    FloatingHeightMode,
    MainPanelMode,
} from "../../../shared/types/config";
import type { PopupContentHeightReport } from "../../../shared/types/ipc";

export type MainPanelPlatform = "darwin" | "win32" | "linux";
export type MainPanelShellMode = "popup" | "floating";

export type { FloatingBoundsConfiguration, FloatingHeightMode, MainPanelMode };

export interface MainPanelController {
    open_or_toggle(): void;
    open_or_focus(): void;
    hide(): void;
    close_for_mode_switch(): void;
    apply_config_change(): void;
    report_content_height(report: PopupContentHeightReport): number | null;
    get_window(): BrowserWindow | null;
    get_mode(): MainPanelShellMode;
}

export interface MainPanelDisplayLike {
    readonly id?: string | number;
    readonly workArea: Rectangle;
}

export type ElectronDisplay = Display;
```

- [ ] **Step 6: Add mode resolver**

Create `src/main/core/main-panel/main-panel-config.ts`:

```ts
import type { AppConfiguration } from "../../../shared/types/config";
import type { MainPanelPlatform, MainPanelShellMode } from "./main-panel-types";

export function resolve_main_panel_mode(
    config: AppConfiguration,
    platform: MainPanelPlatform,
): MainPanelShellMode {
    const mode = config.mainPanelMode ?? "system";
    if (mode === "popup") return "popup";
    if (mode === "floating") return "floating";
    return platform === "darwin" ? "popup" : "floating";
}

export function resolve_floating_height_mode(config: AppConfiguration): "fixed" | "followContent" {
    return config.floatingHeightMode ?? "fixed";
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm vitest run tests/unit/main/main_panel_config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Checkpoint**

Run:

```bash
git status --short
```

Expected: changed config/type files and new unit test files. Do not commit unless the user explicitly asks.

---

### Task 2: Add floating bounds helpers

**Files:**

- Create: `src/main/core/main-panel/floating-bounds.ts`
- Create: `tests/unit/main/floating_bounds.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/main/floating_bounds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    DEFAULT_FLOATING_HEIGHT,
    DEFAULT_FLOATING_WIDTH,
    clamp_floating_bounds_to_display,
    default_floating_bounds,
    restore_floating_bounds,
} from "../../../src/main/core/main-panel/floating-bounds";
import type { FloatingBoundsConfiguration } from "../../../src/shared/types/config";

const work_area = { x: 0, y: 0, width: 1280, height: 720 };
const display = { id: 1, workArea: work_area };
const second_display = { id: 2, workArea: { x: 1280, y: 0, width: 1920, height: 1080 } };

describe("default_floating_bounds", () => {
    it("places the default window inside the work area", () => {
        const out = default_floating_bounds(display);
        expect(out.width).toBe(DEFAULT_FLOATING_WIDTH);
        expect(out.height).toBe(DEFAULT_FLOATING_HEIGHT);
        expect(out.x).toBeGreaterThanOrEqual(work_area.x);
        expect(out.y).toBeGreaterThanOrEqual(work_area.y);
        expect(out.x + out.width).toBeLessThanOrEqual(work_area.x + work_area.width);
        expect(out.y + out.height).toBeLessThanOrEqual(work_area.y + work_area.height);
    });
});

describe("clamp_floating_bounds_to_display", () => {
    it("keeps visible bounds unchanged", () => {
        const saved = { x: 100, y: 80, width: 460, height: 500 };
        expect(clamp_floating_bounds_to_display(saved, display)).toEqual(saved);
    });

    it("clamps a window that is too large for the current work area", () => {
        const saved = { x: -200, y: -100, width: 1600, height: 900 };
        const out = clamp_floating_bounds_to_display(saved, display);
        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        expect(out.width).toBe(1280);
        expect(out.height).toBe(720);
    });

    it("clamps a window that overflows the bottom-right edge", () => {
        const saved = { x: 1100, y: 650, width: 460, height: 500 };
        const out = clamp_floating_bounds_to_display(saved, display);
        expect(out.x).toBe(1280 - 460);
        expect(out.y).toBe(720 - 500);
    });
});

describe("restore_floating_bounds", () => {
    it("uses the saved display when it still exists", () => {
        const saved: FloatingBoundsConfiguration = {
            x: 1400,
            y: 40,
            width: 460,
            height: 500,
            displayId: "2",
        };
        const out = restore_floating_bounds(saved, [display, second_display], display);
        expect(out.x).toBe(1400);
        expect(out.y).toBe(40);
    });

    it("falls back to the preferred display when saved display is gone", () => {
        const saved: FloatingBoundsConfiguration = {
            x: 1400,
            y: 40,
            width: 460,
            height: 500,
            displayId: "99",
        };
        const out = restore_floating_bounds(saved, [display], display);
        expect(out.x).toBe(1280 - 460);
        expect(out.y).toBe(40);
    });

    it("returns a default when no saved bounds exist", () => {
        const out = restore_floating_bounds(undefined, [display], display);
        expect(out.width).toBe(DEFAULT_FLOATING_WIDTH);
        expect(out.height).toBe(DEFAULT_FLOATING_HEIGHT);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/main/floating_bounds.test.ts
```

Expected: FAIL because `floating-bounds.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/main/core/main-panel/floating-bounds.ts`:

```ts
import type { Rectangle } from "electron";
import type { FloatingBoundsConfiguration } from "../../../shared/types/config";

export const DEFAULT_FLOATING_WIDTH = 460;
export const DEFAULT_FLOATING_HEIGHT = 720;
export const MIN_FLOATING_WIDTH = 320;
export const MIN_FLOATING_HEIGHT = 240;

interface DisplayLike {
    readonly id?: string | number;
    readonly workArea: Rectangle;
}

function clamp(value: number, lo: number, hi: number): number {
    if (hi < lo) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

function display_id(display: DisplayLike): string | undefined {
    return display.id === undefined ? undefined : String(display.id);
}

export function default_floating_bounds(display: DisplayLike): FloatingBoundsConfiguration {
    const work = display.workArea;
    const width = Math.min(DEFAULT_FLOATING_WIDTH, work.width);
    const height = Math.min(DEFAULT_FLOATING_HEIGHT, work.height);
    return {
        x: work.x + work.width - width,
        y: work.y + work.height - height,
        width,
        height,
        ...(display_id(display) !== undefined && { displayId: display_id(display) }),
    };
}

export function clamp_floating_bounds_to_display(
    bounds: FloatingBoundsConfiguration,
    display: DisplayLike,
): FloatingBoundsConfiguration {
    const work = display.workArea;
    const width = clamp(Math.round(bounds.width), MIN_FLOATING_WIDTH, work.width);
    const height = clamp(Math.round(bounds.height), MIN_FLOATING_HEIGHT, work.height);
    const x = clamp(Math.round(bounds.x), work.x, work.x + work.width - width);
    const y = clamp(Math.round(bounds.y), work.y, work.y + work.height - height);
    return {
        x,
        y,
        width,
        height,
        ...(display_id(display) !== undefined && { displayId: display_id(display) }),
    };
}

export function restore_floating_bounds(
    saved: FloatingBoundsConfiguration | undefined,
    displays: readonly DisplayLike[],
    preferred: DisplayLike,
): FloatingBoundsConfiguration {
    if (!saved) return default_floating_bounds(preferred);
    const saved_display = displays.find((display) => display_id(display) === saved.displayId);
    return clamp_floating_bounds_to_display(saved, saved_display ?? preferred);
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm vitest run tests/unit/main/floating_bounds.test.ts
```

Expected: PASS.

---

### Task 3: Create main panel controller with unit tests

**Files:**

- Create: `src/main/core/main-panel/main-panel-controller.ts`
- Create: `tests/unit/main/main_panel_controller.test.ts`
- Modify: `src/main/core/popup/popup-height-controller.ts` only if comment still says 85%; update comment to 75%.

- [ ] **Step 1: Write controller tests**

Create `tests/unit/main/main_panel_controller.test.ts` with fake windows. Use this exact shape; keep it pure and do not import Electron runtime values:

```ts
import { describe, expect, it, vi } from "vitest";
import { create_main_panel_controller } from "../../../src/main/core/main-panel/main-panel-controller";
import type { AppConfiguration } from "../../../src/shared/types/config";

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

interface FakeWindow {
    bounds: { x: number; y: number; width: number; height: number };
    destroyed: boolean;
    visible: boolean;
    resizable: boolean;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
    getBounds: () => { x: number; y: number; width: number; height: number };
    isDestroyed: () => boolean;
    isVisible: () => boolean;
    setResizable: ReturnType<typeof vi.fn>;
    setMinimumSize: ReturnType<typeof vi.fn>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
}

function make_window(): FakeWindow {
    const win: FakeWindow = {
        bounds: { x: 0, y: 0, width: 460, height: 480 },
        destroyed: false,
        visible: false,
        resizable: true,
        show: vi.fn(() => {
            win.visible = true;
        }),
        hide: vi.fn(() => {
            win.visible = false;
        }),
        close: vi.fn(() => {
            win.destroyed = true;
            win.visible = false;
        }),
        destroy: vi.fn(() => {
            win.destroyed = true;
            win.visible = false;
        }),
        focus: vi.fn(),
        setBounds: vi.fn((next) => {
            win.bounds = { ...win.bounds, ...next };
        }),
        getBounds: () => win.bounds,
        isDestroyed: () => win.destroyed,
        isVisible: () => win.visible,
        setResizable: vi.fn((value: boolean) => {
            win.resizable = value;
        }),
        setMinimumSize: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        loadURL: vi.fn(),
        on: vi.fn(),
    };
    return win;
}

function build(config: AppConfiguration, platform: "darwin" | "win32" | "linux" = "win32") {
    const windows: FakeWindow[] = [];
    const create_window = vi.fn(() => {
        const win = make_window();
        windows.push(win);
        return win;
    });
    const saved_configs: AppConfiguration[] = [];
    const controller = create_main_panel_controller({
        platform,
        get_config: () => config,
        save_config: (next) => {
            saved_configs.push(next);
            config = next;
        },
        create_window: create_window as never,
        get_renderer_url: (route) => `app://${route}`,
        get_preload_path: () => "preload.js",
        get_app_icon_path: () => "icon.png",
        get_tray_bounds: () => ({ x: 1000, y: 700, width: 24, height: 24 }),
        get_display_for_bounds: () => ({
            id: 1,
            workArea: { x: 0, y: 0, width: 1280, height: 720 },
        }),
        get_all_displays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }],
        get_primary_display: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
    });
    return { controller, create_window, windows, saved_configs };
}

describe("main panel controller", () => {
    it("creates a popup shell on macOS system mode", () => {
        const { controller, create_window } = build(
            { ...base_config, mainPanelMode: "system" },
            "darwin",
        );
        controller.open_or_focus();
        expect(controller.get_mode()).toBe("popup");
        expect(create_window).toHaveBeenCalledTimes(1);
    });

    it("creates a floating shell on Windows system mode", () => {
        const { controller } = build({ ...base_config, mainPanelMode: "system" }, "win32");
        controller.open_or_focus();
        expect(controller.get_mode()).toBe("floating");
    });

    it("hides floating shell instead of destroying it", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "floating" });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.hide).toHaveBeenCalledTimes(1);
        expect(win?.destroy).not.toHaveBeenCalled();
        expect(win?.close).not.toHaveBeenCalled();
    });

    it("closes popup shell on hide", () => {
        const { controller, windows } = build({ ...base_config, mainPanelMode: "popup" });
        controller.open_or_focus();
        const win = windows[0];
        controller.hide();
        expect(win?.close).toHaveBeenCalledTimes(1);
    });

    it("ignores content height reports for fixed floating mode", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "fixed",
        });
        controller.open_or_focus();
        const win = windows[0];
        const out = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(out).toBeNull();
        expect(win?.setBounds).not.toHaveBeenCalledWith(expect.objectContaining({ height: 600 }));
    });

    it("applies content height reports for followContent floating mode", () => {
        const { controller, windows } = build({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
        });
        controller.open_or_focus();
        const win = windows[0];
        const out = controller.report_content_height({
            content_height: 600,
            collapsed_min_height: 200,
        });
        expect(out).toBe(600);
        expect(win?.setBounds).toHaveBeenCalledWith(expect.objectContaining({ height: 600 }));
    });

    it("switches shell immediately when config changes", () => {
        let config: AppConfiguration = { ...base_config, mainPanelMode: "popup" };
        const { controller, windows } = build(config);
        controller.open_or_focus();
        config = { ...config, mainPanelMode: "floating" };
        controller.apply_config_change();
        expect(windows[0]?.close).toHaveBeenCalled();
        expect(controller.get_mode()).toBe("floating");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/main/main_panel_controller.test.ts
```

Expected: FAIL because `main-panel-controller.ts` does not exist.

- [ ] **Step 3: Implement minimal controller**

Create `src/main/core/main-panel/main-panel-controller.ts`. The implementation should expose the same public API tested above and use small injected dependencies so tests avoid Electron boot.

Key implementation shape:

```ts
import type { BrowserWindow, Rectangle } from "electron";
import type { AppConfiguration } from "../../../shared/types/config";
import type { PopupContentHeightReport } from "../../../shared/types/ipc";
import {
    create_popup_height_controller,
    type BoundsLike,
    type PopupHeightController,
} from "../popup/popup-height-controller";
import { resolve_floating_height_mode, resolve_main_panel_mode } from "./main-panel-config";
import { restore_floating_bounds } from "./floating-bounds";
import type {
    MainPanelController,
    MainPanelPlatform,
    MainPanelShellMode,
} from "./main-panel-types";

interface DisplayLike {
    readonly id?: string | number;
    readonly workArea: Rectangle;
}

type WindowLike = Pick<
    BrowserWindow,
    | "close"
    | "destroy"
    | "focus"
    | "getBounds"
    | "hide"
    | "isDestroyed"
    | "isVisible"
    | "loadURL"
    | "on"
    | "setAlwaysOnTop"
    | "setBounds"
    | "setMinimumSize"
    | "setResizable"
    | "show"
>;

export interface MainPanelControllerDeps {
    readonly platform: MainPanelPlatform;
    readonly get_config: () => AppConfiguration;
    readonly save_config: (config: AppConfiguration) => void;
    readonly create_window: (mode: MainPanelShellMode) => WindowLike;
    readonly get_renderer_url: (route: string) => string;
    readonly get_preload_path: () => string;
    readonly get_app_icon_path: () => string;
    readonly get_tray_bounds: () => BoundsLike | null;
    readonly get_display_for_bounds: (bounds: BoundsLike) => DisplayLike;
    readonly get_all_displays: () => readonly DisplayLike[];
    readonly get_primary_display: () => DisplayLike;
}

export function create_main_panel_controller(deps: MainPanelControllerDeps): MainPanelController {
    let win: WindowLike | null = null;
    let mode: MainPanelShellMode = resolve_main_panel_mode(deps.get_config(), deps.platform);
    let height_controller: PopupHeightController | null = null;
    let suppress_bounds_save = false;

    const current_mode = () => resolve_main_panel_mode(deps.get_config(), deps.platform);

    function build_height_controller(target: WindowLike): PopupHeightController {
        return create_popup_height_controller({
            platform: deps.platform,
            get_window: () => {
                if (target.isDestroyed()) return null;
                return {
                    isDestroyed: () => target.isDestroyed(),
                    getBounds: () => target.getBounds(),
                    setBounds: (bounds) => {
                        suppress_bounds_save = true;
                        target.setBounds(bounds);
                        setImmediate(() => {
                            suppress_bounds_save = false;
                        });
                    },
                };
            },
            get_display_for_window: () => deps.get_display_for_bounds(target.getBounds()),
            get_anchor: () => ({ tray_bounds: deps.get_tray_bounds(), user_moved: false }),
        });
    }

    function save_floating_bounds(target: WindowLike): void {
        if (mode !== "floating" || suppress_bounds_save || target.isDestroyed()) return;
        const bounds = target.getBounds();
        const display = deps.get_display_for_bounds(bounds);
        deps.save_config({
            ...deps.get_config(),
            floatingBounds: {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                ...(display.id !== undefined && { displayId: String(display.id) }),
            },
        });
    }

    function create_panel_window(next_mode: MainPanelShellMode): WindowLike {
        mode = next_mode;
        const target = deps.create_window(next_mode);
        target.loadURL(deps.get_renderer_url("popup"));
        target.setAlwaysOnTop(deps.get_config().pinToTop ?? false);

        if (next_mode === "floating") {
            const display = deps.get_tray_bounds()
                ? deps.get_display_for_bounds(deps.get_tray_bounds() as BoundsLike)
                : deps.get_primary_display();
            const bounds = restore_floating_bounds(
                deps.get_config().floatingBounds,
                deps.get_all_displays(),
                display,
            );
            target.setBounds(bounds);
            target.setMinimumSize(320, 240);
            target.setResizable(true);
            target.on("resize", () => save_floating_bounds(target));
            target.on("move", () => save_floating_bounds(target));
        } else {
            target.setResizable(false);
        }

        height_controller = build_height_controller(target);
        target.on("closed", () => {
            if (win === target) {
                win = null;
                height_controller = null;
            }
        });
        win = target;
        return target;
    }

    function ensure_window(): WindowLike {
        if (win && !win.isDestroyed() && mode === current_mode()) return win;
        if (win && !win.isDestroyed()) win.close();
        return create_panel_window(current_mode());
    }

    return {
        open_or_toggle() {
            const target = ensure_window();
            if (mode === "floating" && target.isVisible()) {
                target.hide();
                return;
            }
            if (mode === "popup" && target.isVisible()) {
                target.close();
                return;
            }
            target.show();
            target.focus();
        },
        open_or_focus() {
            const target = ensure_window();
            target.show();
            target.focus();
        },
        hide() {
            if (!win || win.isDestroyed()) return;
            if (mode === "floating") {
                win.hide();
            } else {
                win.close();
            }
        },
        close_for_mode_switch() {
            if (win && !win.isDestroyed()) win.close();
            win = null;
            height_controller = null;
        },
        apply_config_change() {
            const next_mode = current_mode();
            if (next_mode !== mode && win && !win.isDestroyed()) {
                this.close_for_mode_switch();
                const target = create_panel_window(next_mode);
                target.show();
                target.focus();
                return;
            }
            if (win && !win.isDestroyed()) {
                win.setAlwaysOnTop(deps.get_config().pinToTop ?? false);
            }
        },
        report_content_height(report: PopupContentHeightReport) {
            if (!win || win.isDestroyed() || !height_controller) return null;
            if (
                mode === "floating" &&
                resolve_floating_height_mode(deps.get_config()) === "fixed"
            ) {
                return null;
            }
            return height_controller.report_content_height(report);
        },
        get_window() {
            return (win as BrowserWindow | null) ?? null;
        },
        get_mode() {
            return mode;
        },
    };
}
```

If TypeScript reports fake-window type friction in tests, narrow the test cast to `as unknown as MainPanelControllerDeps["create_window"]` instead of weakening production types.

- [ ] **Step 4: Fix stale 85% comments**

In `src/main/core/popup/popup-height-controller.ts`, if comments still say 85%, replace with 75% so docs/code agree.

- [ ] **Step 5: Run controller tests**

Run:

```bash
pnpm vitest run tests/unit/main/main_panel_controller.test.ts tests/unit/main/popup_height_controller.test.ts
```

Expected: PASS.

---

### Task 4: Wire main panel controller into IPC and main process

**Files:**

- Modify: `src/main/ipc/popup-ipc.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update popup IPC dependency name**

Modify `src/main/ipc/popup-ipc.ts` so it accepts a height sink:

```ts
export interface PopupIpcDeps {
    report_content_height: (report: PopupContentHeightReport) => number | null;
}
```

Replace handler body:

```ts
const handler = (_event: unknown, payload: unknown): IpcResult<null> => {
    if (!is_valid_report(payload)) {
        return fail("invalid_payload", "popup height report must include numeric heights");
    }
    deps.report_content_height(payload);
    return ok(null);
};
```

- [ ] **Step 2: Add main-panel IPC channel and API**

Modify `src/shared/types/ipc.ts`:

Add channel:

```ts
MAIN_PANEL_HIDE: "mainPanel:hide",
```

Add API section to `UsageboardApi`:

```ts
main_panel: {
    hide(): void;
};
```

- [ ] **Step 3: Expose preload method**

Modify `src/preload/index.ts`:

Add method object:

```ts
const main_panel_methods = {
    hide: () => void ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_HIDE),
};
```

Include `main_panel: main_panel_methods` in the `popup` route API object.

- [ ] **Step 4: Replace popup state in main process**

Modify `src/main/index.ts`:

1. Import controller:

```ts
import { create_main_panel_controller } from "./core/main-panel/main-panel-controller";
```

2. Before `registerConfigIpc(...)`, declare shared config/controller state:

```ts
let currentConfigSnapshot = currentConfig;
let main_panel_controller: MainPanelController | null = null;
```

Import `type MainPanelController` from `./core/main-panel/main-panel-types`.

3. Remove these local state blocks from the tray section:

```ts
let popupWin: BrowserWindow | null = null;
let popup_controller: PopupHeightController | null = null;
const popup_anchor_state = ...;
function build_popup_controller(...) { ... }
```

4. Create controller after `const tray = new Tray(trayIcon);` inside the tray block:

```ts
main_panel_controller = create_main_panel_controller({
    platform: popup_platform,
    get_config: () => currentConfigSnapshot,
    save_config: (next) => {
        currentConfigSnapshot = next;
        configStore.scheduleSave(next);
    },
    create_window: (mode) => {
        const win = new BrowserWindow({
            width: mode === "floating" ? 460 : WINDOW_CONFIGS.popup.width,
            height: mode === "floating" ? 720 : WINDOW_CONFIGS.popup.height,
            frame: false,
            show: false,
            resizable: mode === "floating",
            icon: get_app_icon_path(),
            webPreferences: {
                ...SECURE_WEB_PREFS,
                preload: getPreloadPath(),
            },
        });
        return win;
    },
    get_renderer_url: getRendererUrl,
    get_preload_path: getPreloadPath,
    get_app_icon_path,
    get_tray_bounds: () => tray.getBounds(),
    get_display_for_bounds: (bounds) => screen.getDisplayMatching(bounds),
    get_all_displays: () => screen.getAllDisplays(),
    get_primary_display: () => screen.getPrimaryDisplay(),
});
```

This code needs access to `tray`, so create it inside the tray block immediately after `const tray = new Tray(trayIcon);`.

4. Update config save callback:

```ts
onConfigSaved: (updatedConfig) => {
    currentConfigSnapshot = updatedConfig;
    log.info("Config saved — rebuilding scheduler and secret keys");
    const newKeys = buildSecretParamKeys(updatedConfig);
    secretParamKeys.clear();
    for (const [k, v] of newKeys) {
        secretParamKeys.set(k, v);
    }
    orchestrator.rebuild(updatedConfig);
    main_panel_controller?.apply_config_change();
},
```

If `main_panel_controller` is scoped inside the tray block, declare it above as:

```ts
let main_panel_controller: MainPanelController | null = null;
```

5. Register IPC:

```ts
cleanupPopupIpc = registerPopupIpc({
    report_content_height: (report) => main_panel_controller?.report_content_height(report) ?? null,
});

ipcMain.handle(IPC_CHANNELS.MAIN_PANEL_HIDE, () => {
    main_panel_controller?.hide();
});
```

6. Replace tray click handler with:

```ts
tray.on("click", () => {
    if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
        trayMenuWin.removeListener("blur", hideTrayMenu);
        trayMenuWin.hide();
    }
    main_panel_controller?.open_or_toggle();
});
```

7. Replace tray menu `tray:openPanel` handler:

```ts
ipcMain.handle("tray:openPanel", () => {
    hideTrayMenu();
    main_panel_controller?.open_or_focus();
});
```

8. Replace E2E auto-open block:

```ts
if (process.env["E2E"] === "1") {
    log.info("E2E mode: auto-opening main panel");
    main_panel_controller?.open_or_focus();
}
```

- [ ] **Step 5: Run TypeScript check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: PASS. If it fails, fix only type errors introduced by this task.

- [ ] **Step 6: Run focused unit tests**

Run:

```bash
pnpm vitest run tests/unit/main/main_panel_config.test.ts tests/unit/main/floating_bounds.test.ts tests/unit/main/main_panel_controller.test.ts tests/unit/main/popup_height_controller.test.ts
```

Expected: PASS.

---

### Task 5: Add settings UI controls and immediate apply path

**Files:**

- Modify: `src/renderer/views/SettingsView.tsx`
- Modify: `src/shared/types/config.ts` if labels need stricter types from Task 1.

- [ ] **Step 1: Add local labels and maps**

Near settings constants in `src/renderer/views/SettingsView.tsx`, add:

```ts
const MAIN_PANEL_MODE_LABELS = ["跟随系统推荐", "弹出面板", "浮动窗口"] as const;
const FLOATING_HEIGHT_MODE_LABELS = ["保持窗口大小", "跟随内容变化"] as const;

function main_panel_mode_label_to_value(label: string): "system" | "popup" | "floating" {
    if (label === "弹出面板") return "popup";
    if (label === "浮动窗口") return "floating";
    return "system";
}

function main_panel_mode_value_to_label(
    value: "system" | "popup" | "floating" | undefined,
): string {
    if (value === "popup") return "弹出面板";
    if (value === "floating") return "浮动窗口";
    return "跟随系统推荐";
}

function floating_height_mode_label_to_value(label: string): "fixed" | "followContent" {
    return label === "跟随内容变化" ? "followContent" : "fixed";
}

function floating_height_mode_value_to_label(value: "fixed" | "followContent" | undefined): string {
    return value === "followContent" ? "跟随内容变化" : "保持窗口大小";
}
```

- [ ] **Step 2: Add derived settings values**

In `SettingsView`, near existing derived values like `pinToTop`, add:

```ts
const mainPanelMode = config?.mainPanelMode ?? "system";
const floatingHeightMode = config?.floatingHeightMode ?? "fixed";
const effectiveMainPanelMode =
    mainPanelMode === "system"
        ? window.usageboard.platform === "darwin"
            ? "popup"
            : "floating"
        : mainPanelMode;
```

- [ ] **Step 3: Replace/extend window settings rows**

In the General → Window section, before “窗口始终置顶”, add:

```tsx
<SetRow title="主面板打开方式" sub="左键托盘图标永远打开主面板，外壳由这里决定">
    <Select
        value={main_panel_mode_value_to_label(mainPanelMode)}
        onChange={(v) => {
            void save({
                ...config,
                mainPanelMode: main_panel_mode_label_to_value(v),
            });
        }}
        options={[...MAIN_PANEL_MODE_LABELS]}
    />
</SetRow>
```

After `窗口始终置顶`, add this conditional row:

```tsx
{
    effectiveMainPanelMode === "floating" && (
        <SetRow
            title="浮动窗口高度"
            sub="保持窗口大小时内容在窗口内滚动；跟随内容变化时只能调整宽度"
        >
            <Select
                value={floating_height_mode_value_to_label(floatingHeightMode)}
                onChange={(v) => {
                    void save({
                        ...config,
                        floatingHeightMode: floating_height_mode_label_to_value(v),
                    });
                }}
                options={[...FLOATING_HEIGHT_MODE_LABELS]}
            />
        </SetRow>
    );
}
```

Keep existing “点击托盘图标” row only if the product still needs it for menu-vs-panel behavior. If it conflicts with the new design, remove that row and any `localState.trayClick` usage that becomes unused.

- [ ] **Step 4: Run renderer type check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: PASS.

---

### Task 6: Add Floating close button and shell-aware renderer behavior

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/views/PopupView.tsx`
- Modify: `src/renderer/styles/globals.css`

- [ ] **Step 1: Add effective shell exposure**

The renderer needs to know whether the live main panel is floating to show `×`.

Add to `UsageboardApi` in `src/shared/types/ipc.ts`:

```ts
main_panel: {
    hide(): void;
    get_mode(): Promise<"popup" | "floating">;
};
```

Add channel:

```ts
MAIN_PANEL_GET_MODE: "mainPanel:getMode",
```

In `src/main/index.ts`, register:

```ts
ipcMain.handle(IPC_CHANNELS.MAIN_PANEL_GET_MODE, () => {
    return main_panel_controller?.get_mode() ?? "popup";
});
```

In `src/preload/index.ts`:

```ts
const main_panel_methods = {
    hide: () => void ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_HIDE),
    get_mode: () =>
        ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_GET_MODE) as Promise<"popup" | "floating">,
};
```

- [ ] **Step 2: Add mode state in PopupView**

In `src/renderer/views/PopupView.tsx`, add state near other state hooks:

```ts
const [main_panel_mode, set_main_panel_mode] = useState<"popup" | "floating">("popup");
```

Add effect after refs:

```ts
useEffect(() => {
    let cancelled = false;
    window.usageboard.main_panel
        .get_mode()
        .then((mode) => {
            if (!cancelled) set_main_panel_mode(mode);
        })
        .catch(() => {
            if (!cancelled) set_main_panel_mode("popup");
        });
    return () => {
        cancelled = true;
    };
}, []);
```

- [ ] **Step 3: Render close button only in live Floating titlebar**

Inside `tb-actions`, after Settings button:

```tsx
{
    is_live && main_panel_mode === "floating" && (
        <button
            className="icon-btn floating-close-btn"
            title="隐藏到托盘"
            aria-label="隐藏主面板"
            onClick={() => {
                window.usageboard.main_panel.hide();
            }}
            type="button"
        >
            <Icon name="close" size={18} />
        </button>
    );
}
```

If `Icon` does not have `close`, use the same close icon already used by SettingsView (`<Icon name="close" ... />`).

- [ ] **Step 4: Ensure titlebar actions remain no-drag**

In `src/renderer/styles/globals.css`, append if needed:

```css
.floating-close-btn {
    -webkit-app-region: no-drag;
}
```

- [ ] **Step 5: Run type check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: PASS.

---

### Task 7: Update E2E tests for tray and Floating behavior

**Files:**

- Modify: `tests/user_e2e/specs/tray_interaction.spec.ts`
- Create or modify: `tests/user_e2e/specs/main_panel_window_modes.spec.ts`

- [ ] **Step 1: Update existing tray close test**

Current `tray_interaction.spec.ts` assumes tray click closes Popup. Change it to force Popup mode when asserting close behavior. Use config setup fixture if available; if not, keep this test for macOS/popup route only and move Floating coverage to the new spec.

New test intent:

```ts
test("tray click closes open popup when main panel mode is popup", async ({ omni }) => {
    const page = await findPopupPage(omni.app);
    await page.evaluate(() =>
        window.usageboard.config
            .get()
            .then((result) =>
                window.usageboard.config.save({ ...result.config, mainPanelMode: "popup" }),
            ),
    );
    await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible();
    const closePromise = page.waitForEvent("close", { timeout: 10_000 });
    await triggerTrayClick(page);
    await closePromise;
});
```

- [ ] **Step 2: Add Floating default test**

Create `tests/user_e2e/specs/main_panel_window_modes.spec.ts`:

```ts
import type { ElectronApplication, Page } from "@playwright/test";
import { createTestWithSetup } from "../fixtures/test_with_setup";

const { test, expect } = createTestWithSetup({ enableTray: true });

async function findMainPanelPage(app: ElectronApplication): Promise<Page> {
    for (let i = 0; i < 20; i++) {
        for (const win of app.windows()) {
            if (win.isClosed()) continue;
            const hasPanel = await win
                .locator('[data-popup="live"]')
                .count()
                .catch(() => 0);
            if (hasPanel > 0) return win;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Main panel not found after 10s");
}

test.describe("main panel window modes", () => {
    test("system mode opens a floating main panel on Windows and Linux", async ({ omni }) => {
        test.skip(process.platform === "darwin", "macOS system mode uses popup");
        const page = await findMainPanelPage(omni.app);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator('[data-popup="live"]').getByText("OmniUsage")).toBeVisible();
        await expect(page.getByRole("button", { name: "隐藏主面板" })).toBeVisible();
    });

    test("floating close button hides without destroying the window", async ({ omni }) => {
        test.skip(process.platform === "darwin", "macOS system mode uses popup");
        const page = await findMainPanelPage(omni.app);
        await page.getByRole("button", { name: "隐藏主面板" }).click();
        await expect(page.locator('[data-popup="live"]')).toBeHidden({ timeout: 10_000 });
        expect(page.isClosed()).toBe(false);
    });
});
```

If Playwright cannot observe hidden BrowserWindow DOM reliably, replace the visibility assertion with an Electron-side `BrowserWindow.isVisible()` evaluation helper from existing fixtures.

- [ ] **Step 3: Run E2E focused tests**

Run:

```bash
pnpm playwright test tests/user_e2e/specs/tray_interaction.spec.ts tests/user_e2e/specs/main_panel_window_modes.spec.ts
```

Expected: PASS, or documented platform-specific skip if tray APIs are unavailable in the environment.

---

### Task 8: Full verification and documentation sync

**Files:**

- Modify: `docs/window_design.md` only if implementation differs from the accepted design.
- Check: `docs/test.md` for any new test requirement wording.

- [ ] **Step 1: Run unit and type verification**

Run:

```bash
pnpm tsc --noEmit
pnpm vitest run tests/unit/main/main_panel_config.test.ts tests/unit/main/floating_bounds.test.ts tests/unit/main/main_panel_controller.test.ts tests/unit/main/popup_height_controller.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run required project test suite**

Run:

```bash
pnpm test
```

Expected: PASS. If existing unrelated failures occur, record the exact failing tests and reason.

- [ ] **Step 3: Manual UI verification**

Run the app with the project’s normal dev command from `package.json`. If unsure, inspect `package.json` scripts first.

Manual checks:

```text
1. Left-click tray icon opens main panel.
2. Right-click tray icon opens tray menu.
3. On Windows/Linux system mode, main panel is Floating by default.
4. Floating × hides the panel and does not quit the app.
5. Left-click tray icon restores hidden Floating panel.
6. Fixed mode: resize height, expand cards, content scrolls inside.
7. FollowContent mode: content changes resize height, and user can adjust width only.
8. Settings mainPanelMode switch applies immediately to an already open panel.
```

- [ ] **Step 4: Packaged smoke if UI behavior changed in Electron main process**

Because this task changes Electron window lifecycle, run packaged smoke if time permits or before claiming production readiness:

```bash
pnpm package
./out/OmniUsage-win32-x64/OmniUsage.exe
```

Manual packaged checks:

```text
1. App starts without white screen.
2. Tray appears.
3. Left-click tray opens main panel.
4. Floating close hides to tray.
5. Settings mode switch applies immediately.
```

If packaged behavior is not verified, final status must say: “自动化路径通过，packaged 行为未验证”.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: only intended source, test, and doc files changed. Do not create a git commit unless the user explicitly asks.
