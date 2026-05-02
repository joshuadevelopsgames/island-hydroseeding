import { useMemo } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';

type Item = { id: string; status: string };

type StatusKanbanProps<T extends Item> = {
  columns: readonly string[];
  items: T[];
  getStatus: (item: T) => string;
  onStatusChange: (itemId: string, newStatus: string) => void | Promise<void>;
  renderCard: (item: T) => React.ReactNode;
  columnClassName?: string;
};

function KanbanColumn({
  id,
  title,
  count,
  children,
  className,
}: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[140px] min-w-[200px] max-w-[320px] flex-1 flex-col rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/40 p-2',
        isOver && 'ring-2 ring-[var(--primary-green)] ring-offset-2 ring-offset-[var(--surface-color)]',
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</h3>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function KanbanCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `card-${id}` });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab touch-manipulation rounded-md border border-[var(--border-color)] bg-[var(--surface-color)] p-3 text-sm shadow-sm active:cursor-grabbing',
        isDragging && 'z-10 opacity-70'
      )}
    >
      {children}
    </div>
  );
}

export function StatusKanban<T extends Item>({
  columns,
  items,
  getStatus,
  onStatusChange,
  renderCard,
  columnClassName,
}: StatusKanbanProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const byColumn = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const c of columns) m.set(c, []);
    for (const item of items) {
      const s = getStatus(item);
      const bucket = m.get(s) ?? [];
      bucket.push(item);
      m.set(s, bucket);
    }
    return m;
  }, [columns, items, getStatus]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);
    if (!aid.startsWith('card-')) return;
    const itemId = aid.slice('card-'.length);
    if (!oid.startsWith('col-')) return;
    const newStatus = oid.slice('col-'.length);
    if (!itemId || !newStatus) return;
    const cur = items.find((i) => i.id === itemId);
    if (cur && getStatus(cur) === newStatus) return;
    void onStatusChange(itemId, newStatus);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <KanbanColumn
            key={col}
            id={col}
            title={col}
            count={byColumn.get(col)?.length ?? 0}
            className={columnClassName}
          >
            {(byColumn.get(col) ?? []).map((item) => (
              <KanbanCard key={item.id} id={item.id}>
                {renderCard(item)}
              </KanbanCard>
            ))}
          </KanbanColumn>
        ))}
      </div>
    </DndContext>
  );
}
