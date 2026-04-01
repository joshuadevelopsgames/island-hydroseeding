/**
 * Buffers console output after init — the browser does not expose past DevTools logs.
 * Install early in main.tsx (before React).
 */

type CaptureEntry = {
  at: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
};

type RuntimeErrorLine = {
  at: string;
  message: string;
  source?: string;
  line?: number;
  col?: number;
};

const MAX_LINES = 350;
const MAX_ARG_LEN = 2_000;

const buffer: CaptureEntry[] = [];
const runtimeErrors: RuntimeErrorLine[] = [];
const MAX_RUNTIME_ERRORS = 40;

let installed = false;

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      }
      if (typeof a === 'string') return a;
      try {
        const s = JSON.stringify(a);
        return s.length > MAX_ARG_LEN ? `${s.slice(0, MAX_ARG_LEN)}…` : s;
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function push(level: CaptureEntry['level'], args: unknown[]) {
  const message = stringifyArgs(args);
  buffer.push({
    at: new Date().toISOString(),
    level,
    message: message.length > MAX_ARG_LEN * 2 ? `${message.slice(0, MAX_ARG_LEN * 2)}…` : message,
  });
  while (buffer.length > MAX_LINES) buffer.shift();
}

/** Call once at app startup */
export function initConsoleCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const c = window.console;
  const methods: (keyof Console)[] = ['log', 'info', 'warn', 'error', 'debug'];

  for (const m of methods) {
    const orig = c[m]?.bind(c) as (...a: unknown[]) => void;
    if (!orig) continue;
    (c as unknown as Record<string, (...a: unknown[]) => void>)[m] = (...args: unknown[]) => {
      try {
        push(m as CaptureEntry['level'], args);
      } catch {
        /* ignore */
      }
      orig(...args);
    };
  }

  window.addEventListener(
    'error',
    (ev) => {
      const line: RuntimeErrorLine = {
        at: new Date().toISOString(),
        message: ev.message || 'Error',
        source: ev.filename,
        line: ev.lineno,
        col: ev.colno,
      };
      runtimeErrors.push(line);
      while (runtimeErrors.length > MAX_RUNTIME_ERRORS) runtimeErrors.shift();
      push('error', [
        `[window.error] ${line.message}`,
        line.source ? `${line.source}:${line.line}:${line.col}` : '',
        ev.error,
      ]);
    },
    true
  );

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const msg =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? 'rejection');
    runtimeErrors.push({ at: new Date().toISOString(), message: `[unhandledrejection] ${msg}` });
    while (runtimeErrors.length > MAX_RUNTIME_ERRORS) runtimeErrors.shift();
    push('error', [`[unhandledrejection] ${msg}`, reason instanceof Error ? reason.stack : reason]);
  });
}

function formatRuntimeErrors(): string {
  if (runtimeErrors.length === 0) return '(no window-level errors captured this session)\n';
  return runtimeErrors
    .map((e) => {
      const loc = e.source != null ? `${e.source}:${e.line ?? '?'}` : '';
      return `[${e.at}] ${e.message}${loc ? ` — ${loc}` : ''}`;
    })
    .join('\n');
}

function formatBuffer(filter?: 'errors-warns'): string {
  const lines =
    filter === 'errors-warns'
      ? buffer.filter((b) => b.level === 'error' || b.level === 'warn')
      : buffer;
  if (lines.length === 0) return '(no buffered console lines yet)\n';
  return lines
    .map((b) => `[${b.at}] [${b.level.toUpperCase()}] ${b.message}`)
    .join('\n');
}

/** Plain-text block for email body */
export function buildConsoleReportSection(maxChars = 12_000): string {
  const header = '--- Runtime errors (isolated) ---\n';
  const errBlock = formatRuntimeErrors();
  const mid = '\n--- Console buffer (log / info / warn / error / debug) ---\n';
  let buf = formatBuffer();
  let out = `${header}${errBlock}${mid}${buf}`;
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}\n\n… [truncated: report exceeded ${maxChars} chars; earlier lines kept where possible]`;
  }
  return out;
}
