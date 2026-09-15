// Netlify gives a streamed response a 60-second budget where a plain one gets
// far less, and the AI recovery plan regularly needs 25-40 seconds. The slow
// work runs inside the stream: a single space goes out immediately (the first
// byte is what starts the streaming budget), another every few seconds keeps
// the connection alive, and the JSON document arrives at the end. Leading
// whitespace is valid JSON, so the browser's response.json() needs no change.
//
// Anything that must produce a non-200 status (validation, auth, quotas) has
// to happen before calling this - once the stream is open the status is sent.
export function streamedJson(
  work: () => Promise<unknown>,
  onError: (error: unknown) => unknown,
  headers: Record<string, string>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try { controller.enqueue(encoder.encode(text)); } catch { /* client went away */ }
      };
      send(" ");
      const heartbeat = setInterval(() => send(" "), 4_000);
      let payload: unknown;
      try {
        payload = await work();
      } catch (error) {
        payload = onError(error);
      } finally {
        clearInterval(heartbeat);
      }
      send(JSON.stringify(payload));
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, { status: 200, headers });
}
