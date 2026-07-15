import type { WeatherData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { deg, glyph, weatherLocation } from '../lib/weather';
import { mapsCoordinatesHref } from '../lib/maps';

export function WeatherWidget() {
  const { envelope, offline } = useWidget<WeatherData>('weather');

  return (
    <WidgetCard title="Weather" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{glyph(data.current.symbol)}</span>
            <span className="text-4xl font-bold">{deg(data.current.temperature)}</span>
            <span className="ml-auto text-sm text-ink-muted">
              💨 {Math.round(data.current.windSpeed)} m/s
            </span>
          </div>
          <a
            href={mapsCoordinatesHref(data.location)}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs text-ink-faint transition hover:text-ink"
          >
            <span aria-hidden>📍</span>
            {weatherLocation(data.location)}
          </a>

          <div className="flex gap-3 overflow-x-auto pb-1 text-center text-xs">
            {data.hours.map((hour) => (
              <div key={hour.time} className="shrink-0">
                <div className="text-ink-faint">{hour.hourLabel}</div>
                <div className="text-base">{glyph(hour.symbol)}</div>
                <div className="font-medium">{deg(hour.temperature)}</div>
                <div className="text-[10px] text-sky-600 dark:text-sky-400">
                  {hour.precipitationMm > 0 ? `${hour.precipitationMm} mm` : ' '}
                </div>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-card-border text-sm">
            {data.days.map((day) => (
              <li key={day.date} className="flex items-center gap-2 py-1">
                <span className="w-10 text-ink-muted">{day.dayLabel}</span>
                <span>{glyph(day.symbol)}</span>
                <span className="w-14 text-xs text-sky-600 dark:text-sky-400">
                  {day.precipitationMm > 0 ? `${day.precipitationMm} mm` : ''}
                </span>
                <span className="ml-auto tabular-nums">
                  <span className="text-ink-faint">
                    {deg(day.minTemperature)}
                  </span>{' '}
                  / <span className="font-medium">{deg(day.maxTemperature)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
