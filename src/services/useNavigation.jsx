import { useCallback, useEffect, useRef, useState } from "react";
import { readRoute, routeUrl } from "./navigation.mjs";

export function useNavigation() {
  const [route, setRoute] = useState(() => readRoute(window.location.href));
  const current = useRef(route);
  const navigate = useCallback((patch, replace = false) => {
    const next = { ...current.current, ...patch };
    const url = routeUrl(window.location.href, next);
    if (url.href !== window.location.href) {
      try {
        window.history[replace ? "replaceState" : "pushState"](null, "", url);
      } catch {
        // A sandboxed MCP iframe may disallow history updates; keep UI usable.
      }
    }
    current.current = next;
    setRoute(next);
  }, []);
  useEffect(() => {
    const restore = () => {
      current.current = readRoute(window.location.href);
      setRoute(current.current);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return { ...route, navigate };
}
