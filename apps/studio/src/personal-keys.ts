/** Per-tab memory only: never localStorage, sessionStorage, cookies, or exports. */
const keys: { jev?: string; openai?: string } = {};
if (typeof window !== "undefined")
  window.addEventListener("pagehide", forgetKeys);
export function rememberKey(provider: "jev" | "openai", key: string) {
  keys[provider] = key;
}
export function forgetKeys() {
  delete keys.jev;
  delete keys.openai;
}
export function personalKeyStatus() {
  return { jev: !!keys.jev, openai: !!keys.openai };
}
export function personalKeyHeaders(): Record<string, string> {
  return {
    ...(keys.jev ? { "X-Jev-Jev-Key": keys.jev } : {}),
    ...(keys.openai ? { "X-Jev-Openai-Key": keys.openai } : {}),
  };
}
