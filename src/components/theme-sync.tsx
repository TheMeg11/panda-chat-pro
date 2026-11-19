"use client";

import { useEffect } from "react";
import { reassertStoredTheme } from "@/lib/local-store";

/**
 * Zero-render safety net mounted once from the root layout: after hydration
 * it re-asserts the stored theme (dark class, palette attribute) on <html>.
 * The pre-paint script normally handles this; this heals environments where
 * that DOM state is lost (hydration stripping, delayed scripts, evicted
 * localStorage with a surviving cookie). Renders nothing.
 */
export function ThemeSync() {
  useEffect(() => {
    reassertStoredTheme();
  }, []);
  return null;
}
