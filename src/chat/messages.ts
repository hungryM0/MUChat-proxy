import type { NormalizedMessage, RequestMessage, SupportedModel, SupportedRole } from "../shared/types";

const SUPPORTED_ROLES = new Set<SupportedRole>(["system", "user", "assistant"]);
const SUPPORTED_MODELS = new Set<SupportedModel>(["deepseek-v3-minda", "deepseek-r1-minda"]);

export function validateModel(model: string): asserts model is SupportedModel {
  if (!SUPPORTED_MODELS.has(model as SupportedModel)) {
    throw new Error(`不支持的模型: ${model}`);
  }
}

export function normalizeMessages(messages: RequestMessage[]): NormalizedMessage[] {
  if (messages.length === 0) {
    throw new Error("messages 不能为空");
  }

  let lastVisibleRole = "";
  const normalized: NormalizedMessage[] = [];
  for (const message of messages) {
    if (!SUPPORTED_ROLES.has(message.role as SupportedRole)) {
      throw new Error(`不支持的 role: ${message.role}`);
    }
    if (typeof message.content !== "string") {
      throw new Error("messages.content 只支持字符串");
    }
    const content = message.content.trim();
    if (!content) {
      throw new Error("messages.content 不能为空");
    }
    if (message.role !== "system") {
      lastVisibleRole = message.role;
    }
    normalized.push({
      role: message.role as SupportedRole,
      content,
    });
  }

  if (lastVisibleRole !== "user") {
    throw new Error("最后一条非 system 消息必须是 user");
  }

  return normalized;
}

export function buildUpstreamQuestion(messages: NormalizedMessage[]): string {
  if (messages.length === 1 && messages[0].role === "user") {
    return messages[0].content;
  }

  return `${messages
    .map((message) => `[${message.role}]\n${message.content}`)
    .join("\n\n")}\n\n请继续基于以上对话，回答最后一条 user 消息的内容。`;
}
