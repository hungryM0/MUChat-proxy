import { describe, expect, it } from "vitest";
import { buildUpstreamQuestion, normalizeMessages, validateModel } from "../../src/chat/messages";

describe("messages", () => {
  it("rejects non string content", () => {
    expect(() =>
      normalizeMessages([{ role: "user", content: ["x"] }]),
    ).toThrow("messages.content 只支持字符串");
  });

  it("requires last non-system message to be user", () => {
    expect(() =>
      normalizeMessages([{ role: "assistant", content: "x" }]),
    ).toThrow("最后一条非 system 消息必须是 user");
  });

  it("builds upstream question from all roles", () => {
    const messages = normalizeMessages([
      { role: "system", content: "你是严谨助手" },
      { role: "user", content: "第一问" },
      { role: "assistant", content: "第一答" },
      { role: "user", content: "第二问" },
    ]);

    expect(buildUpstreamQuestion(messages)).toBe(
      "[system]\n你是严谨助手\n\n[user]\n第一问\n\n[assistant]\n第一答\n\n[user]\n第二问\n\n请继续基于以上对话，回答最后一条 user 消息的内容。",
    );
  });

  it("validates supported models", () => {
    expect(() => validateModel("deepseek-v3-minda")).not.toThrow();
    expect(() => validateModel("bad-model")).toThrow("不支持的模型: bad-model");
  });
});
