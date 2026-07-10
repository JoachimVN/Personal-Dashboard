import type { WeatherData } from '@personal-dashboard/shared';
import { useWidget } from '../useWidget';
import { useDeviceLocation } from '../useDeviceLocation';
import { WidgetCard } from '../components/WidgetCard';

function glyph(symbol: string): string {
  const night = symbol.endsWith('_night');
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return '⛈️';
  if (base.includes('sleet')) return '🌨️';
  if (base.includes('snow')) return '❄️';
  if (base.includes('rainshowers')) return '🌦️';
  if (base.includes('rain')) return '🌧️';
  if (base === 'fog') return '🌫️';
  if (base === 'clearsky') return night ? '🌙' : '☀️';
  if (base === 'fair' || base === 'partlycloudy') return night ? '☁️' : '🌤️';
  return '☁️';
}

const deg = (temp: number) => `${Math.round(temp)}°`;

export function WeatherWidget() {
  const { envelope, offline, refetch } = useWidget<WeatherData>('weather');
  useDeviceLocation(refetch);

  return (
    <WidgetCard title="Weather" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{glyph(data.current.symbol)}</span>
            <span className="text-4xl font-bold">{deg(data.current.temperature)}</span>
            <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              💨 {Math.round(data.current.windSpeed)} m/s
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 text-center text-xs">
            {data.hours.map((hour) => (
              <div key={hour.time} className="shrink-0">
                <div className="text-slate-400 dark:text-slate-500">{hour.hourLabel}</div>
                <div className="text-base">{glyph(hour.symbol)}</div>
                <div className="font-medium">{deg(hour.temperature)}</div>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
            {data.days.map((day) => (
              <li key={day.date} className="flex items-center gap-2 py-1">
                <span className="w-10 text-slate-500 dark:text-slate-400">{day.dayLabel}</span>
                <span>{glyph(day.symbol)}</span>
                <span className="w-14 text-xs text-sky-600 dark:text-sky-400">
                  {day.precipitationMm > 0 ? `${day.precipitationMm} mm` : ''}
                </span>
                <span className="ml-auto tabular-nums">
                  <span className="text-slate-400 dark:text-slate-500">
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
