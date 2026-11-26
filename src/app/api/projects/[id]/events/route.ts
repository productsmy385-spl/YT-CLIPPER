export const dynamic = 'force-dynamic';
export const maxDuration = 3600;
import { NextRequest } from 'next/server';
import { getProjectSnapshot } from '@/lib/studio/snapshot';

/**
 * Server-Sent Events stream of the project's real backend state (job, stages, shorts).
 * Pushes a snapshot whenever it changes; sends a keep-alive comment every 15 s so proxies keep it open.
 * EventSource reconnects automatically if the connection drops.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let last = '';
      const send = () => {
        try {
          const snap = getProjectSnapshot(id);
          if (!snap) {
            controller.enqueue(encoder.encode(`event: gone\ndata: {}\n\n`));
            return;
          }
          const json = JSON.stringify(snap);
          if (json !== last) {
            last = json;
            controller.enqueue(encoder.encode(`data: ${json}\n\n`));
          }
        } catch (err: any) {
          console.error(`[ProjectEvents] ${id}: ${err.message}`);
        }
      };
      send();
      timer = setInterval(send, 1000);
      keepAlive = setInterval(() => controller.enqueue(encoder.encode(`: keep-alive\n\n`)), 15000);
      req.signal.addEventListener('abort', () => {
        if (timer) clearInterval(timer);
        if (keepAlive) clearInterval(keepAlive);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (keepAlive) clearInterval(keepAlive);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
