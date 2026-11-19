import { captureError } from "./errorCapture"; // [SCOPE 061] auto error capture

/**
 * API fetch utility with authentication headers
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("wxkanban_token");
  
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  
  // Add custom headers from options
  if (options?.headers) {
    const customHeaders = new Headers(options.headers);
    customHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
  });

  return res;
}


/**
 * Typed API fetch that parses JSON response
 */
export async function apiFetchJson<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  
  if (!res.ok) {
    const body = (await res.json()) as { error?: string; details?: Array<{ field: string; message: string }> };
    let errorMsg = body.error ?? `Request failed: ${res.status}`;
    if (body.details && body.details.length > 0) {
      const detailStr = body.details.map((d) => `${d.field}: ${d.message}`).join("; ");
      errorMsg = `${errorMsg} — ${detailStr}`;
    }
    // [SCOPE 061] report API failure before throwing (fail-open, never throws)
    captureError({
      kind: "apiFetch",
      name: "ApiError",
      message: errorMsg,
      status: res.status,
      route: path,
    });
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}
