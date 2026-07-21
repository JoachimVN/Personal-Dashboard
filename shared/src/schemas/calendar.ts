import { z } from 'zod';

export const calendarSchema = z.object({
  /**
   * The display grids for the current month and a few months either side, expanded (recurrence
   * applied) and sorted by start.
   */
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      calendar: z.string(),
      allDay: z.boolean(),
      location: z.string().optional(),
      description: z.string().optional(),
      start: z.string(),
      end: z.string(),
      /** Day bucket + time labels, precomputed in the dashboard timezone. */
      date: z.string(),
      startLabel: z.string(),
      endLabel: z.string(),
    }),
  ),
});

export type CalendarData = z.infer<typeof calendarSchema>;
