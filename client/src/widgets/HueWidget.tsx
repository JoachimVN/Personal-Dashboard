import { useRef, useState } from 'react';
import type { HueData, HueLight, HueRoom, HueScene, HueSyncData, WidgetEnvelope } from '@personal-dashboard/shared';
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

function BulbIcon({ on }: Readonly<{ on: boolean }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`relative h-5 w-5 shrink-0 ${on ? 'text-[#f7b955]' : 'text-ink-faint'}`}
      fill={on ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 18.5h5M10.5 21h3M12 3a6 6 0 0 1 3.7 10.7c-.5.4-.7 1-.7 1.6v.7h-6v-.7c0-.6-.2-1.2-.7-1.6A6 6 0 0 1 12 3z" />
    </svg>
  );
}

/**
 * The whole bar is the dimmer, Hue-app style: the fill width is the
 * brightness, dragging anywhere slides it (turning the light on), a plain
 * tap toggles. Only the release posts to the server — the drag itself just
 * moves the optimistic override.
 */
function LightBar({ light, refetch }: Readonly<{ light: HueLight; refetch: () => void }>) {
  const [override, setOverride] = useState<Partial<HueLight> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; moved: boolean } | null>(null);
  const effective = { ...light, ...override };

  async function apply(state: { on?: boolean; brightness?: number }) {
    setOverride((prev) => ({ ...prev, ...state }));
    const ok = await postLightState(light.id, state);
    if (!ok) setOverride(null);
    else refetch();
  }

  function brightnessAt(clientX: number): number {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.min(100, Math.max(1, Math.round(((clientX - rect.left) / rect.width) * 100)));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = { startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    if (!drag.current.moved && Math.abs(event.clientX - drag.current.startX) < 6) return;
    drag.current.moved = true;
    setOverride((prev) => ({ ...prev, on: true, brightness: brightnessAt(event.clientX) }));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const { moved } = drag.current;
    drag.current = null;
    if (moved) void apply({ on: true, brightness: brightnessAt(event.clientX) });
    else void apply({ on: !effective.on });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      void apply({ on: true, brightness: Math.min(100, effective.brightness + 5) });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      void apply({ on: true, brightness: Math.max(1, effective.brightness - 5) });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void apply({ on: !effective.on });
    }
  }

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label={`${light.name} brightness`}
      aria-valuemin={1}
      aria-valuemax={100}
      aria-valuenow={effective.on ? effective.brightness : 0}
      aria-valuetext={effective.on ? `${effective.brightness}%` : 'off'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={`hue-bar relative flex h-11 cursor-pointer touch-pan-y items-center gap-2.5 overflow-hidden rounded-xl bg-track px-3 select-none ${
        effective.on ? 'hue-bar--on' : ''
      }`}
    >
      <span
        aria-hidden
        className="hue-bar-fill absolute inset-y-0 left-0"
        style={{ width: effective.on ? `${effective.brightness}%` : 0 }}
      />
      <BulbIcon on={effective.on} />
      <span
        className={`relative min-w-0 flex-1 truncate text-sm ${effective.reachable ? '' : 'text-ink-faint'}`}
      >
        {light.name}
      </span>
      <span className="relative text-xs tabular-nums text-ink-faint">
        {effective.on ? `${effective.brightness}%` : 'Off'}
      </span>
    </div>
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
              key={`${color}-${i}`}
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

function RoomToggle({ room, refetch }: Readonly<{ room: HueRoom; refetch: () => void }>) {
  const [override, setOverride] = useState<boolean | null>(null);
  const on = override ?? room.anyOn;

  async function toggle() {
    const next = !on;
    setOverride(next);
    try {
      const res = await fetch(`/api/hue/groups/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: next }),
      });
      if (!res.ok) setOverride(null);
      else refetch();
    } catch {
      setOverride(null);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Turn ${room.name} ${on ? 'off' : 'on'}`}
      onClick={() => void toggle()}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-all duration-200 ${
        on
          ? 'border-transparent bg-(--color-accent-personal) shadow-[0_0_10px] shadow-(color:--color-accent-personal)/25'
          : 'border-card-border bg-track'
      }`}
    >
      <span
        className={`absolute top-1/2 left-0.5 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.35)] transition-transform duration-200 ${
          on ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );
}

function NoteIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="currentColor">
      <path d="M9 17.5a3 3 0 1 1-2-2.83V5.6a1 1 0 0 1 .76-.97l10-2.5A1 1 0 0 1 19 3.1v11.4a3 3 0 1 1-2-2.83V7.28l-8 2V17.5z" />
    </svg>
  );
}

/** Dark text on a light palette, white on a dark one — the toggle's fill is the album's colors. */
function readableTextOn(palette: string[]): string {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const average = palette.reduce((sum, hex) => sum + luminance(hex), 0) / Math.max(1, palette.length);
  return average > 0.3 ? '#1a1a1a' : '#ffffff';
}

function MusicSyncToggle({
  room,
  syncing,
  palette,
  onChanged,
}: Readonly<{ room: HueRoom; syncing: boolean; palette: string[]; onChanged: () => void }>) {
  const [override, setOverride] = useState<boolean | null>(null);
  const active = override ?? syncing;

  async function toggle() {
    const next = !active;
    setOverride(next);
    try {
      const res = await fetch(`/api/hue/sync/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: next }),
      });
      if (res.ok) onChanged();
    } catch {
      // The sync widget's own polling shows the real state.
    } finally {
      setOverride(null);
    }
  }

  const colors = palette.length > 0 ? palette : ['#1db954', '#1ed760'];
  const style = active
    ? ({
        '--sync-gradient': `linear-gradient(90deg, ${[...colors, colors[0]].join(', ')})`,
        color: readableTextOn(colors),
      } as React.CSSProperties)
    : undefined;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${active ? 'Stop syncing' : 'Sync'} ${room.name} to Spotify`}
      title={active ? 'Lights follow the album art' : 'Match these lights to the album art on Spotify'}
      onClick={() => void toggle()}
      className="hue-sync-toggle"
      style={style}
    >
      <NoteIcon />
      Music
    </button>
  );
}

const SYNC_PROBLEM_COPY: Record<string, string> = {
  'spotify-rate-limited': 'Spotify is rate limiting, retrying shortly',
  'spotify-unreachable': "Can't reach Spotify, retrying",
  'hue-rate-limited': 'Hue is throttling, easing off for a bit',
  'hue-unreachable': "Some lights aren't responding",
};

function syncLabel(sync: HueSyncData): string {
  if (sync.problem) return SYNC_PROBLEM_COPY[sync.problem] ?? 'Having trouble, retrying';
  if (sync.state === 'starting') return 'Connecting to Spotify';
  if (sync.state === 'nothing-playing' || !sync.track) return 'Waiting for something to play on Spotify';
  const song = `${sync.track.name} · ${sync.track.artist}`;
  return sync.state === 'paused' ? `Paused · ${song}` : song;
}

function MusicSyncStatus({ sync }: Readonly<{ sync: HueSyncData }>) {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2 rounded-lg bg-track px-2.5 py-1.5 text-xs">
      {sync.track?.imageUrl && (
        <img src={sync.track.imageUrl} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
      )}
      {sync.palette.length > 0 && (
        <span aria-hidden className="flex shrink-0 -space-x-1">
          {sync.palette.map((color, i) => (
            <span key={i} className="hue-sync-swatch h-2.5 w-2.5 rounded-full ring-1 ring-black/25" style={{ background: color }} />
          ))}
        </span>
      )}
      <span className={`min-w-0 truncate ${sync.problem ? 'text-ink-faint' : ''}`}>{syncLabel(sync)}</span>
    </div>
  );
}

function SceneGrid({ scenes, refetch }: Readonly<{ scenes: HueScene[]; refetch: () => void }>) {
  if (scenes.length === 0) return null;
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
      {scenes.map((scene) => (
        <SceneChip key={scene.id} scene={scene} refetch={refetch} />
      ))}
    </div>
  );
}

function hueErrorFallback(entry: WidgetEnvelope<HueData>) {
  if (entry.error !== 'timeout' && entry.error !== 'fetch-failed') return undefined;
  return <p className="text-sm text-ink-faint">Can't reach Philips Hue's cloud — lights will reconnect automatically.</p>;
}

export function HueWidget() {
  const { envelope, offline, refetch } = useWidget<HueData>('hue');
  const sync = useWidget<HueSyncData>('hue-sync');
  const syncData = sync.envelope?.data;
  const syncAvailable = sync.envelope?.status === 'ready' || sync.envelope?.status === 'stale';
  const onSyncChanged = () => {
    sync.refetch();
    refetch(); // starting a sync can switch lights on
  };

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
            <div className="space-y-2">
              {data.lights.map((light) => (
                <LightBar key={light.id} light={light} refetch={refetch} />
              ))}
            </div>
            {(data.rooms.length > 0 || data.scenes.length > 0) && (
              <div className="mt-3 space-y-2.5 border-t border-card-border pt-3">
                {data.rooms.map((room) => {
                  const syncing = syncData?.roomIds.includes(room.id) ?? false;
                  return (
                  <div key={room.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs uppercase tracking-wider text-ink-faint">{room.name}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {syncAvailable && (
                          <MusicSyncToggle
                            room={room}
                            syncing={syncing}
                            palette={syncData?.palette ?? []}
                            onChanged={onSyncChanged}
                          />
                        )}
                        <RoomToggle room={room} refetch={onSyncChanged} />
                      </div>
                    </div>
                    {syncing && syncData && <MusicSyncStatus sync={syncData} />}
                    <SceneGrid
                      scenes={data.scenes.filter((scene) => scene.room === room.name)}
                      refetch={onSyncChanged}
                    />
                  </div>
                  );
                })}
                {(() => {
                  const roomNames = new Set(data.rooms.map((room) => room.name));
                  const orphans = data.scenes.filter(
                    (scene) => scene.room === null || !roomNames.has(scene.room),
                  );
                  if (orphans.length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-ink-faint">Other</p>
                      <SceneGrid scenes={orphans} refetch={refetch} />
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )
      }
    </WidgetCard>
  );
}
