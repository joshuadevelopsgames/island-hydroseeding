import { useEffect, useRef, useState } from 'react';

export type PickedElementPayload = {
  tag: string;
  id: string;
  className: string;
  cssPath: string;
  textPreview: string;
  rect: { top: number; left: number; width: number; height: number };
  outerHTMLSnippet: string;
};

function cssPathFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; depth < 8 && node !== null; depth++) {
    if (node.nodeType !== Node.ELEMENT_NODE) break;
    const elNode: Element = node;
    const tag = elNode.tagName.toLowerCase();
    if (elNode.id) {
      parts.unshift(`#${CSS.escape(elNode.id)}`);
      break;
    }
    const nextParent: Element | null = elNode.parentElement;
    if (nextParent) {
      const sameTag = [...nextParent.children].filter((c) => c.tagName === elNode.tagName);
      const idx = sameTag.indexOf(elNode) + 1;
      parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    } else {
      parts.unshift(tag);
    }
    node = nextParent;
  }
  return parts.join(' > ');
}

function safeOuterHTMLSnippet(el: Element, max = 500): string {
  try {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input').forEach((inp) => {
      inp.setAttribute('value', '[redacted]');
    });
    clone.querySelectorAll('textarea').forEach((ta) => {
      ta.textContent = '[redacted]';
    });
    let s = clone.outerHTML.replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return '(could not serialize element)';
  }
}

function textPreview(el: Element, max = 180): string {
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t || '(no text)';
}

function isIgnorableTarget(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE') return true;
  if (el.closest('[data-feedback-ui="true"]')) return true;
  return false;
}

function toPayload(el: Element): PickedElementPayload {
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || '(none)',
    className: typeof el.className === 'string' ? el.className || '(none)' : '(none)',
    cssPath: cssPathFor(el),
    textPreview: textPreview(el),
    rect: {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
    outerHTMLSnippet: safeOuterHTMLSnippet(el),
  };
}

type Props = {
  active: boolean;
  onPick: (payload: PickedElementPayload) => void;
  onCancel: () => void;
};

export default function ElementPickerOverlay({ active, onPick, onCancel }: Props) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onPickRef = useRef(onPick);
  const onCancelRef = useRef(onCancel);
  onPickRef.current = onPick;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }

    const highlightTarget = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el || isIgnorableTarget(el)) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setBox({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    };

    const onMove = (e: MouseEvent) => {
      if (!activeRef.current) return;
      highlightTarget(e.clientX, e.clientY);
    };

    const onClick = (e: MouseEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isIgnorableTarget(el)) return;
      onPickRef.current(toPayload(el));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.body.style.cursor = 'crosshair';

    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.cursor = '';
      setBox(null);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div className="element-picker-chrome" data-feedback-ui="true">
        <p className="element-picker-chrome__title">Select an element</p>
        <p className="element-picker-chrome__hint">
          Move over the page — the outline shows what will be attached to your report. Click to confirm. Press{' '}
          <kbd>Esc</kbd> to cancel.
        </p>
      </div>
      {box && (
        <div
          className="element-picker-highlight"
          aria-hidden
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        />
      )}
    </>
  );
}
