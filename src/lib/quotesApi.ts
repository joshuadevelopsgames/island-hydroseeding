import type {
  Quote,
  QuoteBundle,
  QuoteLineItem,
  ProductService,
  QuoteTemplate,
  CrmProperty,
} from '@/lib/quotesTypes';

const QUOTES = '/api/quotes';
const PRODUCTS = '/api/products';

/** Avoid throwing huge HTML bodies or tokens as Error.message (breaks UI layout). */
function messageFromUnparsedBody(text: string, statusText: string): string {
  const t = text.trim();
  if (!t) return statusText || 'Request failed';
  if (t.startsWith('<') && t.includes('>')) return 'Server returned HTML instead of JSON.';
  if (t.length > 400) return 'Unexpected response from the server.';
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

export function formatErrorForUi(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.length <= 320) return raw;
  return `${raw.slice(0, 280)}…`;
}

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(messageFromUnparsedBody(text, r.statusText));
  }
}

export async function fetchQuotes(): Promise<Quote[]> {
  const r = await fetch(`${QUOTES}?action=list`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Quotes ${r.status}`);
  }
  const data = await readJson<{ quotes: Quote[] }>(r);
  return data.quotes ?? [];
}

export async function fetchQuoteBundle(quoteId: string): Promise<QuoteBundle> {
  const r = await fetch(`${QUOTES}?action=get&id=${encodeURIComponent(quoteId)}`, { cache: 'no-store' });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Quote ${r.status}`);
  }
  return readJson(r);
}

export async function quotesPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(QUOTES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Quotes ${r.status}`);
  }
  return readJson<T>(r);
}

export async function fetchProducts(): Promise<ProductService[]> {
  const r = await fetch(`${PRODUCTS}?action=list`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Products ${r.status}`);
  }
  const data = await readJson<{ products: ProductService[] }>(r);
  return data.products ?? [];
}

export async function fetchTemplates(): Promise<QuoteTemplate[]> {
  const r = await fetch(`${PRODUCTS}?action=templates`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Templates ${r.status}`);
  }
  const data = await readJson<{ templates: QuoteTemplate[] }>(r);
  return data.templates ?? [];
}

export async function productsPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(PRODUCTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Products ${r.status}`);
  }
  return readJson<T>(r);
}

export async function fetchAccountProperties(accountId: string): Promise<CrmProperty[]> {
  const r = await fetch(`${QUOTES}?action=properties&account_id=${encodeURIComponent(accountId)}`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Properties ${r.status}`);
  }
  const data = await readJson<{ properties: CrmProperty[] }>(r);
  return data.properties ?? [];
}
