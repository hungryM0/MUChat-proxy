export type SupportedRole = "system" | "user" | "assistant";
export type SupportedModel = "deepseek-v3-minda" | "deepseek-r1-minda";

export interface ChatCompletionRequest {
  model: string;
  messages: RequestMessage[];
  stream?: boolean;
}

export interface RequestMessage {
  role: string;
  content: unknown;
}

export interface NormalizedMessage {
  role: SupportedRole;
  content: string;
}

export interface ErrorBody {
  error: {
    message: string;
    type: string;
  };
}

export interface LineDelta {
  content?: string;
  reasoning_content?: string;
}

export interface AnswerLine {
  id?: string;
  choices?: Array<{
    delta: LineDelta;
  }>;
}

export interface StreamEvent {
  type: string;
  data?: string;
}

export interface LoginPageInfo {
  flowId: string;
  publicKey: string;
  formFields: Record<string, string>;
  formPostUrl: string;
}

export interface TokenRecord {
  token: string;
  expiresAt: number;
}
