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
    // řetězec a binární data (Buffer, např. XLSX) beze změny, ostatní jako JSON
    const body = typeof r?.body === 'string' || r?.body instanceof Uint8Array ? r.body : JSON.stringify(r?.body ?? {});
    return new Response(body, { status, headers: r?.headers || { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// Den za `days` dní od dneška v UTC – stejný „dnešek“ jako server (dates.js todayYmd). Dřív místní setDate a pak
// toISOString (UTC): v Tokiu ráno nebo v New Yorku večer to byl jiný den než serverový a testy padaly podle hodiny.
export function ymdPlus(days) {
  return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
}
