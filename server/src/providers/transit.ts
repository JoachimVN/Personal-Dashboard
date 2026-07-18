import { z } from 'zod';
import { transitDataSchema, type TransitData } from '@personal-dashboard/shared';
import type { Provider } from '../scheduler.js';

// Identify ourselves as Entur's API terms require (ET-Client-Name: <owner>-<application>).
const CLIENT_NAME = 'joachimvn-personal-dashboard';
const GEOCODER_URL = 'https://api.entur.io/geocoder/v1/reverse';
const JOURNEY_PLANNER_URL = 'https://api.entur.io/journey-planner/v3/graphql';
/** How far ahead departures are requested, in seconds — enough to bridge night-time service gaps. */
const TIME_RANGE_S = 3 * 60 * 60;

const geocoderSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        id: z.string(),
        name: z.string(),
        /** Distance from the query point, in km. */
        distance: z.number().optional(),
      }),
    }),
  ),
});

const journeyPlannerSchema = z.object({
  data: z.object({
    stopPlaces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        estimatedCalls: z.array(
          z.object({
            realtime: z.boolean(),
            cancellation: z.boolean(),
            aimedDepartureTime: z.string(),
            expectedDepartureTime: z.string(),
            destinationDisplay: z.object({ frontText: z.string() }).nullable(),
            serviceJourney: z.object({
              line: z.object({
                publicCode: z.string().nullable(),
                transportMode: z.string().nullable(),
                presentation: z.object({ colour: z.string().nullable() }).nullable(),
              }),
            }),
          }),
        ),
      }).nullable(),
    ),
  }),
});

const DEPARTURES_QUERY = `
query ($ids: [String]!, $departures: Int!, $timeRange: Int!) {
  stopPlaces(ids: $ids) {
    id
    name
    estimatedCalls(numberOfDepartures: $departures, timeRange: $timeRange) {
      realtime
      cancellation
      aimedDepartureTime
      expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney { line { publicCode transportMode presentation { colour } } }
    }
  }
}`;

export interface TransitSettings {
  /** NSR stop place ids to pin, e.g. ["NSR:StopPlace:41613"]; empty = nearest stops to the dashboard's coordinates. */
  stopIds: string[];
  maxStops: number;
  departuresPerStop: number;
}

interface ResolvedStop {
  id: string;
  distanceMeters?: number;
}

type StopFeature = z.infer<typeof geocoderSchema>['features'][number];
type EstimatedCall = NonNullable<z.infer<typeof journeyPlannerSchema>['data']['stopPlaces'][number]>['estimatedCalls'][number];

export interface TransitProvider extends Provider<TransitData> {
  /** Overrides the env-configured location, e.g. with the client's device geolocation. */
  setCoords(next: { lat: number; lon: number }): void;
}

/** Nearby geocoder hits can repeat a stop name (paired directional platforms); keep the closest of each. */
export function selectNearestStops(features: StopFeature[], maxStops: number): ResolvedStop[] {
  const seenNames = new Set<string>();
  const stops: ResolvedStop[] = [];
  for (const feature of features) {
    const { id, name, distance } = feature.properties;
    if (!id.includes('StopPlace') || seenNames.has(name)) continue;
    seenNames.add(name);
    stops.push({ id, distanceMeters: distance !== undefined ? Math.round(distance * 1000) : undefined });
    if (stops.length >= maxStops) break;
  }
  return stops;
}

export function mapDepartures(calls: EstimatedCall[]): TransitData['stops'][number]['departures'] {
  return calls
    .filter((call) => !call.cancellation)
    .map((call) => ({
      line: call.serviceJourney.line.publicCode ?? '•',
      destination: call.destinationDisplay?.frontText ?? 'Unknown destination',
      mode: call.serviceJourney.line.transportMode ?? 'bus',
      aimedTime: call.aimedDepartureTime,
      expectedTime: call.expectedDepartureTime,
      realtime: call.realtime,
      color: call.serviceJourney.line.presentation?.colour
        ? `#${call.serviceJourney.line.presentation.colour.replace(/^#/, '')}`
        : undefined,
    }));
}

async function resolveNearestStops(
  coords: { lat: number; lon: number },
  maxStops: number,
  signal: AbortSignal,
): Promise<ResolvedStop[]> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('point.lat', coords.lat.toFixed(4));
  url.searchParams.set('point.lon', coords.lon.toFixed(4));
  url.searchParams.set('layers', 'venue');
  // Fetch more than needed so the name-dedupe still leaves maxStops distinct stops.
  url.searchParams.set('size', String(maxStops * 3));
  const res = await fetch(url, { signal, headers: { 'ET-Client-Name': CLIENT_NAME } });
  if (!res.ok) throw new Error(`entur geocoder responded ${res.status}`);
  const stops = selectNearestStops(geocoderSchema.parse(await res.json()).features, maxStops);
  if (stops.length === 0) throw new Error('entur geocoder returned no stop places');
  return stops;
}

export function createTransitProvider(
  fallbackCoords: { lat: number; lon: number } | undefined,
  settings: TransitSettings,
): TransitProvider {
  let coords = fallbackCoords;
  /** Nearest stops only change with the location, so re-resolve only when it does. */
  let stopsCache: { key: string; stops: ResolvedStop[] } | undefined;

  return {
    id: 'transit',
    schema: transitDataSchema,
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => settings.stopIds.length > 0 || coords !== undefined,
    setCoords(next) {
      coords = next;
    },
    async fetch(signal) {
      let stops: ResolvedStop[];
      if (settings.stopIds.length > 0) {
        stops = settings.stopIds.map((id) => ({ id }));
      } else {
        if (!coords) throw new Error('transit is not configured');
        const key = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
        if (stopsCache?.key !== key) {
          stopsCache = { key, stops: await resolveNearestStops(coords, settings.maxStops, signal) };
        }
        stops = stopsCache.stops;
      }

      const res = await fetch(JOURNEY_PLANNER_URL, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'ET-Client-Name': CLIENT_NAME },
        body: JSON.stringify({
          query: DEPARTURES_QUERY,
          variables: {
            ids: stops.map((stop) => stop.id),
            departures: settings.departuresPerStop,
            timeRange: TIME_RANGE_S,
          },
        }),
      });
      if (!res.ok) throw new Error(`entur journey-planner responded ${res.status}`);
      const parsed = journeyPlannerSchema.parse(await res.json());
      const distanceById = new Map(stops.map((stop) => [stop.id, stop.distanceMeters]));

      return {
        stops: parsed.data.stopPlaces
          .filter((place): place is NonNullable<typeof place> => place !== null)
          .map((place) => ({
            id: place.id,
            name: place.name,
            distanceMeters: distanceById.get(place.id),
            departures: mapDepartures(place.estimatedCalls),
          })),
      };
    },
  };
}
