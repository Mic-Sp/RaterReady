"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh server-rendered status only. No browser clock or local countdown ever authorizes access or grants more time. */
export function ServerStatusRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [active, router]);
  return null;
}
