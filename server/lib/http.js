// HTTP klient nad vestavěným fetch: timeout, opakování při 5xx/síťové chybě,
// jednoduchý cookie jar a omezovač souběžnosti.

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} ${url.split('?')[0]}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  get(name) {
    return this.cookies.get(name);
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, opts = {}) {
  const {
    method = 'GET', headers = {}, body, timeoutMs = 15000, retries = 1, jar, as = 'json',
  } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const h = { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/plain, */*', ...headers };
      if (jar && jar.cookies.size) h.Cookie = jar.header();
      let payload = body;
      if (body && typeof body === 'object') {
        payload = JSON.stringify(body);
        h['Content-Type'] = 'application/json';
      }
      const res = await fetch(url, { method, headers: h, body: payload, signal: ctrl.signal, redirect: 'follow' });
      if (jar) jar.store(res);
      const text = await res.text();
      if (!res.ok) {
        const err = new HttpError(res.status, url, text.slice(0, 500));
        // 5xx má smysl zkusit znovu, 4xx (vč. 429 bot-gate) ne.
        if (res.status >= 500 && attempt < retries) {
          lastErr = err;
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      if (as === 'text') return text;
      try {
        return JSON.parse(text);
      } catch {
        throw new HttpError(res.status, url, `Neplatné JSON: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      lastErr = e.name === 'AbortError' ? new Error(`Timeout ${timeoutMs} ms: ${url.split('?')[0]}`) : e;
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Omezí počet souběžně běžících async úloh. */
export function limiter(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
