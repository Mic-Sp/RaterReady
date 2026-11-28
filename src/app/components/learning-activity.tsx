"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Signal visible visits after hydration so route prefetching never counts as a visit or lesson start. */
export function LearningActivity({ lesson = false }: { lesson?: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    // The actual reader emits its own signal only after the server has found a valid lesson.
    if (!lesson && /^\/learn\/G[1-6]\/?$/.test(pathname)) return;
    const record = () => {
      if (document.visibilityState === "visible") void fetch("/api/learning-activity", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lesson }),
      }).catch(() => {});
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [lesson, pathname]);
  return null;
}
