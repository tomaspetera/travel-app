// Pomocníci pro testy: náhrada globálního fetch.

/**
 * Nahradí globalThis.fetch funkcí handler(url, init) → { status, body, headers }.
 * Vrací seznam zachycených požadavků a funkci pro obnovení.
 */
export function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = await handler(String(url), init);
    const status = r?.status ?? 200;
    const body = typeof r?.body === 'string' ? r.body : JSON.stringify(r?.body ?? {});
    return new Response(body, { status, headers: r?.headers || { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export function ymdPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
