import { describe, expect, it } from "vitest";
import { parseUpstreamEvents } from "../../src/upstream/muc";

describe("upstream muc", () => {
  it("parses fastAnswer event", async () => {
    const events = await collectEvents(["event: fastAnswer\n", "\n"]);
    expect(events).toEqual([{ type: "fastAnswer" }]);
  });

  it("parses answer event and done event", async () => {
    const events = await collectEvents([
      "event: answer\n",
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
      "\n",
      "event: flowResponses\n",
      "data: [DONE]\n",
      "\n",
    ]);

    expect(events).toEqual([
      { type: "answer", data: '{"choices":[{"delta":{"content":"hi"}}]}' },
      { type: "done", data: "[DONE]" },
    ]);
  });
});

async function collectEvents(lines: string[]): Promise<Array<{ type: string; data?: string }>> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  const events: Array<{ type: string; data?: string }> = [];
  for await (const event of parseUpstreamEvents(stream)) {
    events.push(event);
  }
  return events;
}
