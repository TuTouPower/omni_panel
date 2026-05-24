import { useState, useEffect } from "react";

export function useRoute(): string {
    const [route, setRoute] = useState(() => window.location.hash.slice(1) || "popup");

    useEffect(() => {
        const handler = () => {
            setRoute(window.location.hash.slice(1) || "popup");
        };
        window.addEventListener("hashchange", handler);
        return () => {
            window.removeEventListener("hashchange", handler);
        };
    }, []);

    return route;
}
