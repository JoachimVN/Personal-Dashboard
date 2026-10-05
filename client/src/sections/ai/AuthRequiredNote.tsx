import type { WidgetEnvelope } from '@personal-dashboard/shared';

/** The usage numbers below stay frozen until someone signs the CLI back in on the server machine;
 * no amount of Refresh will change that, so say so instead of leaving a silently stale reading. */
export function AuthRequiredNote({ envelope }: Readonly<{ envelope: WidgetEnvelope<unknown> | null }>) {
  if (envelope?.error !== 'auth-required') return null;
  return (
    <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
      Signed out on the dashboard machine. Run <code>/login</code> in the CLI there to resume updates.
    </p>
  );
}
