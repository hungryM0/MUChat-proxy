import type { TokenCache } from "./state/token-cache";

export interface AppEnv {
  MUC_USERNAME: string;
  MUC_PASSWORD: string;
  API_KEYS: string;
  TOKEN_CACHE: DurableObjectNamespace<TokenCache>;
}
