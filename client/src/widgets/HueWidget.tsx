import { useRef, useState } from 'react';
import type { HueData, HueLight, WidgetEnvelope } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

async function postLightState(id: string, state: { on?: boolean; brightness?: number }): Promise<boolean> {
  try {
    const res = await fetch(`/api/hue/lights/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function LightRow({ light, refetch }: Readonly<{ light: HueLight; refetch: () => void }>) {
  const [override, setOverride] = useState<Partial<HueLight> | null>(null);
  const brightnessTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const effective = { ...light, ...override };

  async function toggle() {
    const on = !effective.on;
    setOverride({ on });
    const ok = await postLightState(light.id, { on });
    if (!ok) setOverride(null);
    else refetch();
  }

  function changeBrightness(brightness: number) {
    setOverride((prev) => ({ ...prev, brightness }));
    clearTimeout(brightnessTimer.current);
    brightnessTimer.current = setTimeout(async () => {
      const ok = await postLightState(light.id, { brightness });
      if (!ok) setOverride(null);
      else refetch();
    }, 300);
  }

  return (
    <li className="flex items-center gap-3 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={effective.on}
        aria-label={`Turn ${light.name} ${effective.on ? 'off' : 'on'}`}
        onClick={() => void toggle()}
        className={`h-5 w-9 shrink-0 rounded-full transition-colors ${
          effective.on ? 'bg-(--color-accent-personal)' : 'bg-track'
        }`}
      >
        <span
          className={`block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
            effective.on ? 'translate-x-[18px]' : ''
          }`}
        />
      </button>
      <span className={`min-w-0 flex-1 truncate text-sm ${effective.reachable ? '' : 'text-ink-faint'}`}>
        {light.name}
      </span>
      <input
        type="range"
        min={1}
        max={100}
        value={effective.brightness}
        disabled={!effective.on}
        onChange={(event) => changeBrightness(Number(event.target.value))}
        aria-label={`${light.name} brightness`}
        className="w-20 shrink-0 accent-(--color-accent-personal) disabled:opacity-40"
      />
    </li>
  );
}

function hueErrorFallback(entry: WidgetEnvelope<HueData>) {
  if (entry.error !== 'timeout' && entry.error !== 'fetch-failed') return undefined;
  return <p className="text-sm text-ink-faint">Can't reach Philips Hue's cloud — lights will reconnect automatically.</p>;
}

export function HueWidget() {
  const { envelope, offline, refetch } = useWidget<HueData>('hue');

  return (
    <WidgetCard
      title="Lights"
      envelope={envelope}
      offline={offline}
      errorFallback={hueErrorFallback}
    >
      {(data) =>
        data.lights.length === 0 ? (
          <p className="text-sm text-ink-faint">No lights found on the bridge.</p>
        ) : (
          <ul className="divide-y divide-card-border">
            {data.lights.map((light) => (
              <LightRow key={light.id} light={light} refetch={refetch} />
            ))}
          </ul>
        )
      }
    </WidgetCard>
  );
}
