/**
 * Request deduplicator - prevents duplicate API calls within a time window
 * Useful for preventing accidental double-clicks and rapid re-requests
 */

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

const pendingRequests = new Map<string, PendingRequest>();

/**
 * Generate a unique key for a request based on method, URL, and body
 */
function generateRequestKey(
  method: string,
  url: string,
  body?: any
): string {
  const bodyStr = body ? JSON.stringify(body) : '';
  return `${method}:${url}:${bodyStr}`;
}

/**
 * Deduplicate API requests within a time window
 * If the same request is made within the window, returns the cached promise
 */
export async function deduplicateRequest<T>(
  method: string,
  url: string,
  fn: () => Promise<T>,
  options: {
    deduplicationWindow?: number; // in milliseconds, default 1000ms
  } = {}
): Promise<T> {
  const { deduplicationWindow = 1000 } = options;
  const key = generateRequestKey(method, url);
  const now = Date.now();

  // Check if we have a pending request within the deduplication window
  if (pendingRequests.has(key)) {
    const pending = pendingRequests.get(key)!;
    if (now - pending.timestamp < deduplicationWindow) {
      // Return the cached promise
      return pending.promise;
    } else {
      // Request is too old, remove it
      pendingRequests.delete(key);
    }
  }

  // Create new request
  const promise = fn().finally(() => {
    // Clean up after a delay to allow for rapid re-requests of new data
    setTimeout(() => {
      if (pendingRequests.get(key)?.promise === promise) {
        pendingRequests.delete(key);
      }
    }, deduplicationWindow);
  });

  // Store the pending request
  pendingRequests.set(key, {
    promise,
    timestamp: now,
  });

  return promise;
}

/**
 * Clear all pending requests (useful for testing or logout)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * Get the number of currently pending requests
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Fetch wrapper with automatic deduplication
 */
export async function deduplicatedFetch(
  url: string,
  options: RequestInit & { deduplicationWindow?: number } = {}
): Promise<Response> {
  const { deduplicationWindow, ...fetchOptions } = options;
  const method = fetchOptions.method || 'GET';

  return deduplicateRequest(
    method,
    url,
    () => fetch(url, fetchOptions),
    { deduplicationWindow }
  );
}
