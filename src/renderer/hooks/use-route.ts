/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect } from "react";

const MODULE = "use-route";

export function use_route(): string {
    const [route, setRoute] = useState(() => window.location.hash.slice(1) || "popup");

    useEffect(() => {
        const handler = () => {
            const newRoute = window.location.hash.slice(1) || "popup";
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
