import { parseSseChunk, type SseEvent } from "@/lib/eventStream";

it.each(["\n", "\r\n", "\r"])("preserves frames at every chunk boundary with %j endings", (ending) => {
  const payload = ['event: invalidate', 'data: {"resource":"orders"}', '', 'event: notification', 'data: {"id":"n1"}', '', ': heartbeat', ''].join(ending);
  const expected = [
    { event: "invalidate", data: '{"resource":"orders"}', id: null, retryMs: null },
    { event: "notification", data: '{"id":"n1"}', id: null, retryMs: null },
  ];
  for (let split = 1; split < payload.length; split += 1) {
    const first = parseSseChunk(payload.slice(0, split));
    const last = parseSseChunk(first.rest + payload.slice(split));
    expect([...first.events, ...last.events]).toEqual(expected);
  }
  let rest = "";
  const events: SseEvent[] = [];
  for (const char of payload) {
    const parsed = parseSseChunk(rest + char);
    rest = parsed.rest;
    events.push(...parsed.events);
  }
  expect(events).toEqual(expected);
});
