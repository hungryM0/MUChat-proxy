import { CENSORED_MESSAGE } from "../shared/constants";
import { jsonResponse } from "../shared/http";
import type { SupportedModel } from "../shared/types";
import { parseAnswerLine, parseUpstreamEvents } from "../upstream/muc";

export async function presentNonStreamChat(
  model: SupportedModel,
  stream: ReadableStream<Uint8Array>,
): Promise<Response> {
  let finalContent = "";

  for await (const event of parseUpstreamEvents(stream)) {
    if (event.type === "fastAnswer") {
      finalContent += CENSORED_MESSAGE;
      continue;
    }
    if (event.type === "answer" && event.data && event.data !== "[DONE]") {
      const content = readDeltaContent(event.data);
      if (content) {
        finalContent += content;
      }
      continue;
    }
    if (event.type === "done" || event.data === "[DONE]") {
      break;
    }
  }

  return jsonResponse({
    id: newResponseId(),
    object: "chat.completion",
    created: createdAt(),
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: finalContent,
        },
      },
    ],
  });
}

export function presentStreamChat(model: SupportedModel, stream: ReadableStream<Uint8Array>): Response {
  const created = createdAt();
  const responseId = newResponseId();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  void (async () => {
    try {
      await writeChunk(writer, encoder, {
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            finish_reason: null,
            delta: {
              role: "assistant",
            },
          },
        ],
      });

      for await (const event of parseUpstreamEvents(stream)) {
        if (event.type === "fastAnswer") {
          await writeChunk(writer, encoder, {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                finish_reason: null,
                delta: {
                  content: CENSORED_MESSAGE,
                },
              },
            ],
          });
          continue;
        }

        if (event.type === "answer" && event.data && event.data !== "[DONE]") {
          const content = readDeltaContent(event.data);
          if (!content) {
            continue;
          }
          await writeChunk(writer, encoder, {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                finish_reason: null,
                delta: {
                  content,
                },
              },
            ],
          });
        }

        if (event.type === "done" || event.data === "[DONE]") {
          break;
        }
      }

      await writeChunk(writer, encoder, {
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            delta: {},
          },
        ],
      });
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function writeChunk(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown,
): Promise<void> {
  await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function newResponseId(): string {
  return `chatcmpl-${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function createdAt(): number {
  return Math.floor(Date.now() / 1000);
}

function readDeltaContent(raw: string): string {
  const line = parseAnswerLine(raw);
  const delta = line.choices?.[0]?.delta;
  if (!delta) {
    return "";
  }
  if (delta.content) {
    return delta.content;
  }
  return "";
}
