import { useRef, useState } from 'react';
import type { HueData, HueLight, HueScene, WidgetEnvelope } from '@personal-dashboard/shared';
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

function SceneChip({ scene, refetch }: Readonly<{ scene: HueScene; refetch: () => void }>) {
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/hue/scenes/${scene.id}`, { method: 'POST' });
      if (res.ok) refetch();
    } catch {
      // Widget polling will surface the real state.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void activate()}
      disabled={busy}
      className="flex min-w-0 items-center gap-1.5 rounded-lg bg-track px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
    >
      {scene.colors.length > 0 && (
        <span aria-hidden className="flex shrink-0 -space-x-1">
          {scene.colors.map((color, i) => (
            <span
              // Palette order is stable and colors can repeat — index is the identity here.
              key={i}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-black/25"
              style={{ background: color }}
            />
          ))}
        </span>
      )}
      <span className="truncate">{scene.name}</span>
    </button>
  );
}

/** Scenes grouped by room, rooms in the server's (alphabetical) order. */
function groupScenesByRoom(scenes: HueScene[]): [string, HueScene[]][] {
  const rooms = new Map<string, HueScene[]>();
  for (const scene of scenes) {
    const room = scene.room ?? 'Other';
    const list = rooms.get(room) ?? [];
    list.push(scene);
    rooms.set(room, list);
  }
  return [...rooms.entries()];
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
          <>
            <ul className="divide-y divide-card-border">
              {data.lights.map((light) => (
                <LightRow key={light.id} light={light} refetch={refetch} />
              ))}
            </ul>
            {data.scenes.length > 0 && (
              <div className="mt-3 space-y-2.5 border-t border-card-border pt-3">
                {groupScenesByRoom(data.scenes).map(([room, scenes]) => (
                  <div key={room}>
                    <p className="text-xs uppercase tracking-wider text-ink-faint">{room}</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      {scenes.map((scene) => (
                        <SceneChip key={scene.id} scene={scene} refetch={refetch} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      }
    </WidgetCard>
  );
}
