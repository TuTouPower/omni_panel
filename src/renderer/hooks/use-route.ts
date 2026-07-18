/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect } from "react";

const MODULE = "use-route";

const VALID_ROUTES = new Set(["usage", "settings", "agent", "tray"]);

function normalize_hash(raw: string): string {
    return VALID_ROUTES.has(raw) ? raw : "usage";
}

export function use_route(): string {
    const [route, setRoute] = useState(() => normalize_hash(window.location.hash.slice(1)));

    useEffect(() => {
        const handler = () => {
            const newRoute = normalize_hash(window.location.hash.slice(1));
            window.usageboard.log({
                level: "debug",
                module: MODULE,
                message: `Route changed to ${newRoute}`,
            });
            setRoute(newRoute);
        };
        window.addEventListener("hashchange", handler);
        return () => {
            window.removeEventListener("hashchange", handler);
        };
    }, []);

    return route;
}
