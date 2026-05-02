import { useEffect, useRef, type ReactNode } from 'react';

export type EditableField =
  // Shared
  | 'title'
  | 'introduction'
  | 'contractDisclaimer'
  | 'notes'
  | 'footer_quote'
  // Quote-only
  | 'accept_heading'
  | 'accept_body'
  | 'issued_by_heading'
  | 'issued_by_body'
  // Invoice-only
  | 'paymentTerms';

type Props = {
  field: EditableField;
  value: string;
  /** When omitted, EditableText renders read-only (used on the public pay page). */
  onEdit?: (field: EditableField, next: string) => void;
  /** Allow line breaks (Enter inserts \n instead of blurring). Default false. */
  multiline?: boolean;
  /** Render as block-level (div) vs inline (span). Default 'span'. */
  as?: 'span' | 'div';
  /** Placeholder shown (visually only) when value is empty. */
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Optional fallback when value is empty AND no edit callback (read-only views). */
  emptyFallback?: ReactNode;
};

/**
 * Inline-editable text on the design preview. When `onEdit` is provided the
 * element is contentEditable; on blur, the new text is reported back via
 * onEdit so the parent form/state updates and the preview re-renders.
 *
 * Read-only by default (no onEdit) — used on the public pay page where clients
 * shouldn't be able to mutate the document content.
 */
export default function EditableText({
  field,
  value,
  onEdit,
  multiline = false,
  as = 'span',
  placeholder,
  className,
  style,
  emptyFallback,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  // Sync external value into the contentEditable element when it changes from
  // the form side (so two-way binding works without clobbering the user's
  // current cursor while they're focused on the element).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if ((el.textContent ?? '') !== value) {
      el.textContent = value;
    }
  }, [value]);

  if (!onEdit) {
    if (!value && emptyFallback != null) return <>{emptyFallback}</>;
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }

  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={field}
      data-empty={value ? undefined : ''}
      data-placeholder={placeholder ?? ''}
      onBlur={(e) => {
        const next = (e.currentTarget as HTMLElement).innerText.replace(/\n+$/g, '');
        if (next !== value) onEdit(field, next);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onPaste={(e) => {
        // Always paste as plain text — designs control their own typography.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      className={(className ? className + ' ' : '') + 'editable-text-slot'}
      style={{
        outline: 'none',
        cursor: 'text',
        borderRadius: '2px',
        ...style,
      }}
    />
  );
}

// Inject a single global rule so editable text fields show a subtle hover hint
// across all designs without each design having to opt in to the styling.
if (typeof document !== 'undefined' && !document.getElementById('editable-text-slot-styles')) {
  const s = document.createElement('style');
  s.id = 'editable-text-slot-styles';
  s.textContent = `
    .editable-text-slot:hover { box-shadow: inset 0 0 0 1px rgba(176, 51, 55, 0.25); }
    .editable-text-slot:focus { box-shadow: inset 0 0 0 1px rgba(176, 51, 55, 0.55); background: rgba(176, 51, 55, 0.04); }
    .editable-text-slot[data-empty]::before { content: attr(data-placeholder); color: rgba(0, 0, 0, 0.35); font-style: italic; pointer-events: none; }
    .editable-text-slot[data-empty]:focus::before { display: none; }
  `;
  document.head.appendChild(s);
}
