import type { ResolvedClientBranding } from '@/lib/tenantBranding';

function BrandImg({ br }: { br: ResolvedClientBranding }) {
  const src = br.logoUrl?.trim() || '';
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-10 w-auto max-w-[180px] object-contain object-left"
        height={40}
        decoding="async"
      />
    );
  }
  return (
    <img
      src="/invoice-brand-mark.svg"
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0"
      decoding="async"
    />
  );
}

/** Compact header matching the client invoice / pay page identity. */
export function TenantBrandPreview({
  br,
  className,
}: {
  br: ResolvedClientBranding;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-start gap-3 ${className ?? ''}`}>
      <BrandImg br={br} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-green)]">{br.companyName}</p>
        <p className="text-xs text-[var(--text-muted)]">{br.tagline}</p>
      </div>
    </div>
  );
}
