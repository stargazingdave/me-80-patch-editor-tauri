export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function api<T>(path: string, method = "GET", body: Record<string, unknown> = {}): Promise<T> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("The native Tauri bridge is unavailable.");
  try {
    return await invoke<T>("api", { path, method, body });
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
