/**
 * Runs once when the Next.js server starts, before it serves requests. Node-only work lives in
 * instrumentation-node.ts; the NEXT_RUNTIME check lets webpack drop it from the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
