import { ensureInitialized } from "@/lib/init-server";
import { addChangeListener } from "@/lib/watcher";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureInitialized();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`),
      );

      // Register change listener
      const removeListener = addChangeListener((event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream closed, clean up
          removeListener();
        }
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`),
          );
        } catch {
          clearInterval(heartbeat);
          removeListener();
        }
      }, 30_000);

      // Clean up when the stream is cancelled (client disconnects)
      // Note: We store cleanup refs so they can be triggered on close
      const cleanup = () => {
        clearInterval(heartbeat);
        removeListener();
      };

      // The cancel callback is called when the client disconnects
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel() {
      // This is called when the client disconnects
      // Unfortunately we can't easily reference the cleanup function from start()
      // The heartbeat and listener will self-clean on next write failure
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
