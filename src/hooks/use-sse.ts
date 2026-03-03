"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Connect to the SSE endpoint at /api/events and call onEvent for each message.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function useSSE(onEvent: (data: unknown) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;

    function connect() {
      es = new EventSource("/api/events");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current(data);
        } catch {
          // Ignore parse errors (e.g. heartbeat comments)
        }
      };

      es.onopen = () => {
        backoff = 1000; // Reset backoff on successful connection
      };

      es.onerror = () => {
        es?.close();
        // Reconnect with exponential backoff
        reconnectTimeout = setTimeout(() => {
          backoff = Math.min(backoff * 2, 30000);
          connect();
        }, backoff);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);
}

/**
 * Wraps useSSE to call `refetch` whenever a non-heartbeat, non-connected event arrives.
 */
export function useAutoRefresh(refetch: () => void) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const handleEvent = useCallback((data: unknown) => {
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data
    ) {
      const eventType = (data as { type: string }).type;
      if (eventType !== "heartbeat" && eventType !== "connected") {
        refetchRef.current();
      }
    }
  }, []);

  useSSE(handleEvent);
}
