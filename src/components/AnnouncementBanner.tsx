import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { fetchAnnouncements } from '@/lib/opsApi';

export default function AnnouncementBanner() {
  const { data: items = [] } = useQuery({
    queryKey: ['ops', 'announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 60_000,
  });
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => items.filter((a) => !hidden[a.id]), [items, hidden]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-2" role="region" aria-label="Announcements">
      {visible.map((a) => (
        <div
          key={a.id}
          className="relative rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary-green)_28%,var(--border-color))] bg-[color-mix(in_srgb,var(--primary-green)_7%,var(--surface-color))] px-4 py-3 pr-10 text-sm text-[var(--text-primary)] shadow-sm"
        >
          <p className="font-bold">{a.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-[var(--text-secondary)] leading-relaxed">{a.body}</p>
          <button
            type="button"
            className="btn-icon absolute right-2 top-2 h-8 w-8 border-0 bg-transparent"
            aria-label="Dismiss announcement"
            onClick={() => setHidden((h) => ({ ...h, [a.id]: true }))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
