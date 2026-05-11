declare namespace Cloudflare {
  interface Env {
    MUC_USERNAME: string;
    MUC_PASSWORD: string;
    API_KEYS: string;
    TOKEN_CACHE: DurableObjectNamespace<import("./src/state/token-cache").TokenCache>;
  }
}
