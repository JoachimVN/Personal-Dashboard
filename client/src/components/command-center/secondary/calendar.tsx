import type { ReactNode } from 'react';
import type { CalendarData, CommandCenterSlot } from '@personal-dashboard/shared';

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  return new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
  });
}

export function CalendarAgendaSecondary({ slot, calendar }: Readonly<{ slot: CommandCenterSlot; calendar: CalendarData | undefined }>): ReactNode {
  if (slot.render.type !== 'calendar-agenda') return null;
  const agenda = slot.render.eventIds
    .map((id) => calendar?.events.find((event) => event.id === id))
    .filter((event): event is CalendarData['events'][number] => event !== undefined);
  if (!agenda.length) return null;
  return <div className="command-agenda-list mt-4">
    {agenda.map((event) => <div key={event.id} className="command-agenda-item">
      <time dateTime={event.start}>{formatEventDay(event)}</time><span>{event.title}</span>
    </div>)}
  </div>;
}
