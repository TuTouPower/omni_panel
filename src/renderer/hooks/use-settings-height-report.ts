import { useEffect, useRef } from "react";

const SETTINGS_FIXED_HEIGHT = 700;

export function useSettingsHeightReport(): void {
    const reported_ref = useRef(false);

    useEffect(() => {
        if (reported_ref.current) return;
        reported_ref.current = true;
        window.usageboard.popup.report_content_height({
            content_height: SETTINGS_FIXED_HEIGHT,
            collapsed_min_height: SETTINGS_FIXED_HEIGHT,
        });
    }, []);
}
