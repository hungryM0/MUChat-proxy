import type { AppEnv } from "../env";
import { badGateway, badRequest } from "../shared/http";
import type { ChatCompletionRequest, NormalizedMessage, SupportedModel } from "../shared/types";
import { getAccessToken } from "../state/token-cache";
import { modelReasoning, startUpstreamStream } from "../upstream/muc";
import { buildUpstreamQuestion, normalizeMessages, validateModel } from "./messages";
import { presentNonStreamChat, presentStreamChat } from "./presenter";

export async function handleChatCompletions(request: Request, env: AppEnv): Promise<Response> {
  let payload: ChatCompletionRequest;
  try {
    payload = await readSingleJson(request);
  } catch {
    return badRequest("请求 JSON 不合法");
  }

  if (!payload || typeof payload !== "object") {
    return badRequest("请求 JSON 不合法");
  }
  if (typeof payload.model !== "string" || !Array.isArray(payload.messages)) {
    return badRequest("请求 JSON 不合法");
  }

  let model: SupportedModel;
  let messages: NormalizedMessage[];
  try {
    validateModel(payload.model);
    model = payload.model;
    messages = normalizeMessages(payload.messages);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "请求参数不合法");
  }

  const question = buildUpstreamQuestion(messages);
  let accessToken: string;
  try {
    accessToken = await getAccessToken(env);
  } catch {
    return badGateway("获取 access token 失败");
  }

  const reasoning = modelReasoning(model);
  let upstream;
  try {
    upstream = await startUpstreamStream(accessToken, question, reasoning, "");
  } catch {
    return badGateway("请求上游失败");
  }

  try {
    if (payload.stream) {
      return presentStreamChat(model, upstream.stream);
    }
    return await presentNonStreamChat(model, upstream.stream);
  } catch {
    return badGateway("解析上游响应失败");
  }
}

async function readSingleJson(request: Request): Promise<ChatCompletionRequest> {
  const text = await request.text();
  return JSON.parse(text) as ChatCompletionRequest;
}
