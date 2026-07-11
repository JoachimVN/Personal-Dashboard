import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Reorder, useDragControls, type DragControls } from 'motion/react';

export interface ArrangeableItem {
  id: string;
  label: string;
  render: () => ReactNode;
}

interface ArrangeableWidgetGridProps {
  /** Section id under which this grid's order is persisted (server/.data/layout.json). */
  sectionId: string;
  items: ArrangeableItem[];
}

/** Known ids in their saved order first, any new ids appended, stale ids dropped. */
function mergeOrder(saved: string[] | undefined, items: ArrangeableItem[]): string[] {
  const knownIds = new Set(items.map((item) => item.id));
  const fromSaved = (saved ?? []).filter((id) => knownIds.has(id));
  const missing = items.map((item) => item.id).filter((id) => !fromSaved.includes(id));
  return [...fromSaved, ...missing];
}

async function persistLayout(sectionId: string, order: string[]): Promise<void> {
  try {
    await fetch(`/api/layout/${sectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  } catch {
    // Best-effort — a failed save just means the next reorder starts from the last-known order.
  }
}

function DragHandle({ dragControls }: { dragControls: DragControls }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      onPointerDown={(event) => dragControls.start(event)}
      className="cursor-grab touch-none px-1 text-ink-faint select-none active:cursor-grabbing"
    >
      ⠿
    </button>
  );
}

function ArrangeRow({
  item,
  isFirst,
  isLast,
  onMove,
  onDragEnd,
}: {
  item: ArrangeableItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onDragEnd: () => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 rounded-lg bg-track/60 px-2 py-1.5"
    >
      <DragHandle dragControls={dragControls} />
      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
      <button
        type="button"
        aria-label={`Move ${item.label} up`}
        disabled={isFirst}
        onClick={() => onMove(-1)}
        className="rounded px-1.5 py-0.5 text-ink-muted hover:bg-track disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${item.label} down`}
        disabled={isLast}
        onClick={() => onMove(1)}
        className="rounded px-1.5 py-0.5 text-ink-muted hover:bg-track disabled:opacity-30"
      >
        ↓
      </button>
    </Reorder.Item>
  );
}

/**
 * A section's widget cards, reorderable via a compact drag-handle list rather than dragging the
 * full-size cards in place — simpler and more robust than fighting 2D grid drag physics.
 */
export function ArrangeableWidgetGrid({ sectionId, items }: ArrangeableWidgetGridProps) {
  const [order, setOrder] = useState<string[]>(() => items.map((item) => item.id));
  const orderRef = useRef(order);
  orderRef.current = order;
  const [arranging, setArranging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/layout');
        if (!res.ok) return;
        const { layout } = (await res.json()) as { layout: Record<string, string[]> };
        if (!cancelled) setOrder(mergeOrder(layout[sectionId], items));
      } catch {
        // Keep the default order.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items is the static per-section widget list
  }, [sectionId]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const orderedItems = order
    .map((id) => byId.get(id))
    .filter((item): item is ArrangeableItem => item !== undefined);

  function move(index: number, direction: -1 | 1) {
    const next = [...orderRef.current];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    void persistLayout(sectionId, next);
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setArranging((prev) => !prev)}
          className="rounded px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-track hover:text-ink"
        >
          {arranging ? 'Done' : 'Arrange'}
        </button>
      </div>
      {arranging ? (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-1">
          {orderedItems.map((item, index) => (
            <ArrangeRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === orderedItems.length - 1}
              onMove={(direction) => move(index, direction)}
              onDragEnd={() => void persistLayout(sectionId, orderRef.current)}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {orderedItems.map((item) => (
            <div key={item.id}>{item.render()}</div>
          ))}
        </div>
      )}
    </div>
  );
}
