"use client";

import { useCallback, useEffect, useState } from "react";
import type { SettingsStatus } from "@/lib/types";

export function useSettings() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data: SettingsStatus = await res.json();
      setStatus(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  return { status, refresh };
}
