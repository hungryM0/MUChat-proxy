import { CHAT_URL, CLIENT_ID, USER_AGENT } from "../shared/constants";
import type { AnswerLine, StreamEvent, SupportedModel } from "../shared/types";

export function modelReasoning(model: SupportedModel): boolean {
  return model === "deepseek-r1-minda";
}

export function parseAnswerLine(raw: string): AnswerLine {
  return JSON.parse(raw) as AnswerLine;
}

export async function startUpstreamStream(
  accessToken: string,
  question: string,
  reasoning: boolean,
  chatId = "",
): Promise<{ chatId: string; stream: ReadableStream<Uint8Array> }> {
  const payload = {
    chatId,
    detail: "true",
    alias: "deepseek",
    question,
    chatQuestionId: "",
    extendParams: {
      agentCode: "",
      reasoning,
      rewriteResult: "{}",
    },
  };

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Accept-Language": "zh-CN,zh;q=0.9",
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      Clientid: CLIENT_ID,
      "User-Agent": USER_AGENT,
      Cookie: `Authorization=Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const body = await response.text();
    throw new Error(`上游状态码异常: ${response.status}, body: ${body.trim()}`);
  }

  const chatHeader = response.headers.get("Chat-Question-Id");
  if (!chatHeader) {
    throw new Error("上游响应缺少 Chat-Question-Id");
  }

  return {
    chatId: chatHeader.split("_")[0],
    stream: response.body,
  };
}

export async function* parseUpstreamEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";
  let dataLine = "";

  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) {
        break;
      }
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);

      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        if (eventType === "fastAnswer") {
          yield { type: "fastAnswer" };
          return;
        }
        continue;
      }
      if (line.startsWith("data:")) {
        dataLine = line.slice("data:".length).trim();
        continue;
      }
      if (line === "") {
        if (eventType) {
          if (eventType === "flowResponses") {
            yield { type: "done", data: dataLine };
            return;
          }
          yield { type: eventType, data: dataLine };
        }
        eventType = "";
        dataLine = "";
      }
    }
  }
}
