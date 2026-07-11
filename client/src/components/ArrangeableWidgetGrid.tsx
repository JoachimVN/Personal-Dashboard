import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';

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

/**
 * A section's widget cards, directly reorderable in their responsive grid. The uncluttered
 * arrange mode uses the cards themselves as drag targets, with keyboard movement as a fallback.
 */
export function ArrangeableWidgetGrid({ sectionId, items }: ArrangeableWidgetGridProps) {
  const [order, setOrder] = useState<string[]>(() => items.map((item) => item.id));
  const orderRef = useRef(order);
  orderRef.current = order;
  const [arranging, setArranging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/layout');
        if (!res.ok) return;
        const { layout } = (await res.json()) as { layout: Record<string, string[]> };
        if (!cancelled) {
          const next = mergeOrder(layout[sectionId], items);
          orderRef.current = next;
          setOrder(next);
        }
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
    orderRef.current = next;
    setOrder(next);
    void persistLayout(sectionId, next);
  }

  function placeBefore(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = [...orderRef.current];
    const sourceIndex = next.indexOf(sourceId);
    if (sourceIndex === -1) return;
    next.splice(sourceIndex, 1);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex === -1) return;
    next.splice(targetIndex, 0, sourceId);
    orderRef.current = next;
    setOrder(next);
  }

  function startDrag(id: string, event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
    setDropTargetId(null);
  }

  function dragOver(targetId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceId = draggingId ?? event.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId) {
      setDropTargetId(targetId);
      placeBefore(sourceId, targetId);
    }
  }

  function finishDrag() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  function drop(targetId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceId = draggingId ?? event.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId) {
      placeBefore(sourceId, targetId);
      void persistLayout(sectionId, orderRef.current);
    }
    finishDrag();
  }

  function moveWithKeyboard(index: number, event: KeyboardEvent<HTMLDivElement>) {
    if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(index, event.key === 'ArrowUp' ? -1 : 1);
  }

  return (
    <div>
      <div className="mb-3 flex min-h-8 items-center justify-between px-1">
        {arranging && <p className="text-xs text-ink-faint">Drag cards to reorder</p>}
        <button
          type="button"
          onClick={() => {
            setArranging((prev) => !prev);
            finishDrag();
          }}
          className="ml-auto rounded-full border border-card-border bg-card/40 px-3 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-track hover:text-ink"
        >
          {arranging ? 'Done' : 'Arrange'}
        </button>
      </div>
      <div className={`arrangeable-grid arrangeable-grid--${sectionId} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
        {orderedItems.map((item, index) => {
          const isDragging = draggingId === item.id;
          const isDropTarget = dropTargetId === item.id;
          return (
            <motion.div
              key={item.id}
              layout="position"
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              draggable={arranging}
              tabIndex={arranging ? 0 : undefined}
              aria-label={arranging ? `Reorder ${item.label}` : undefined}
              aria-keyshortcuts={arranging ? 'Shift+ArrowUp Shift+ArrowDown' : undefined}
              onKeyDown={arranging ? (event) => moveWithKeyboard(index, event) : undefined}
              onDragStartCapture={arranging ? (event) => startDrag(item.id, event) : undefined}
              onDragEndCapture={arranging ? finishDrag : undefined}
              onDragOver={arranging ? (event) => dragOver(item.id, event) : undefined}
              onDrop={arranging ? (event) => drop(item.id, event) : undefined}
              className={`relative transition duration-150 ${
                arranging ? 'cursor-grab focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--color-accent-personal) active:cursor-grabbing' : ''
              } ${
                isDragging ? 'scale-[0.985] opacity-35' : isDropTarget ? 'rounded-2xl outline-2 -outline-offset-2 outline-(--color-accent-personal)' : ''
              }`}
            >
              {item.render()}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
