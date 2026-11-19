// [SCOPE 065 / T011] Shared client helper for the marketing AI assist endpoints.
// POSTs to /api/sysadmin/marketing/ai/<path>; returns the parsed body on ok, else
// null (alerting on throttle / fail-open). Used by the inline assist on the
// Campaigns and Posts tabs.
export async function aiPost<T>(path: string, payload: unknown): Promise<T | null> {
  try {
    const res = await fetch(`/api/sysadmin/marketing/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (res.status === 429) { alert('Too many requests — give it a few seconds.'); return null; }
    const data = await res.json().catch(() => ({}));
    if (!data.ok) { alert(data.error || 'AI generation failed — try again.'); return null; }
    return data as T;
  } catch {
    alert('AI generation failed — try again.');
    return null;
  }
}
