import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let auth: SupabaseClient | undefined;
export function configureAuth(url: string, key: string) {
  return (auth ??= createClient(url, key));
}
export function authClient() {
  return auth;
}
export async function authHeaders(): Promise<Record<string, string>> {
  const session = await auth?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export async function cloudRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/studio${path}`, {
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
