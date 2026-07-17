import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const healthDays = pgTable('health_days', {
  date: text('date').primaryKey(),
  steps: doublePrecision('steps'),
  watchSteps: doublePrecision('watch_steps'),
  phoneSteps: doublePrecision('phone_steps'),
  activeEnergyKcal: doublePrecision('active_energy_kcal'),
  exerciseMinutes: doublePrecision('exercise_minutes'),
  standHours: doublePrecision('stand_hours'),
  heartRate: doublePrecision('heart_rate'),
  restingHeartRate: doublePrecision('resting_heart_rate'),
  walkingHeartRate: doublePrecision('walking_heart_rate'),
  bloodOxygenPercent: doublePrecision('blood_oxygen_percent'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsageHistoryPoints = pgTable(
  'ai_usage_history_points',
  {
    toolId: text('tool_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    fiveHourUsedPercent: doublePrecision('five_hour_used_percent'),
    weeklyUsedPercent: doublePrecision('weekly_used_percent'),
    modelWeeklyUsedPercent: doublePrecision('model_weekly_used_percent'),
  },
  (table) => [primaryKey({ columns: [table.toolId, table.at] }), index('ai_usage_points_tool_at_idx').on(table.toolId, table.at)],
);

export const aiUsageSnapshots = pgTable('ai_usage_snapshots', {
  toolId: text('tool_id').primaryKey(),
  snapshot: jsonb('snapshot').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const spotifySnapshot = pgTable('spotify_snapshot', {
  id: integer('id').primaryKey(),
  snapshot: jsonb('snapshot'),
  rateLimitedUntil: bigint('rate_limited_until', { mode: 'number' }).notNull().default(0),
  topDataFetchedAt: bigint('top_data_fetched_at', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const spotifyArtists = pgTable('spotify_artists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  url: text('url'),
  genres: text('genres').array().notNull().default([]),
});

export const spotifyAlbums = pgTable('spotify_albums', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  artist: text('artist').notNull(),
  imageUrl: text('image_url'),
  url: text('url'),
  releaseDate: text('release_date'),
  releaseDatePrecision: text('release_date_precision'),
  totalTracks: integer('total_tracks'),
  totalDurationMs: integer('total_duration_ms'),
  albumType: text('album_type'),
});

export const spotifyTracks = pgTable('spotify_tracks', {
  id: text('id').primaryKey(),
  track: text('track').notNull(),
  artist: text('artist').notNull(),
  artistIds: text('artist_ids').array().notNull().default([]),
  album: text('album'),
  // Deliberately no FK: metadata can arrive after an independently-observed track.
  albumId: text('album_id'),
  releaseDate: text('release_date'),
  durationMs: integer('duration_ms'),
  imageUrl: text('image_url'),
  url: text('url'),
  playCount: integer('play_count').notNull(),
  verified: boolean('verified'),
});

export const spotifyHistoryMeta = pgTable('spotify_history_meta', {
  id: integer('id').primaryKey(),
  seededAt: timestamp('seeded_at', { withTimezone: true }),
  lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
});

/** Prevents two dashboard instances from incrementing the same recently-played event twice. */
export const spotifyObservedPlays = pgTable(
  'spotify_observed_plays',
  {
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    trackId: text('track_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.playedAt, table.trackId] })],
);

export const steamPlaytimeHistory = pgTable('steam_playtime_history', {
  date: text('date').primaryKey(),
  totalPlaytimeMinutes: doublePrecision('total_playtime_minutes').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signalCurrent = pgTable(
  'signal_current',
  {
    source: text('source').notNull(),
    metric: text('metric').notNull(),
    value: jsonb('value').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.source, table.metric] })],
);

export const signalHistory = pgTable(
  'signal_history',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: text('source').notNull(),
    metric: text('metric').notNull(),
    value: jsonb('value').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('signal_history_source_metric_recorded_idx').on(table.source, table.metric, table.recordedAt),
    uniqueIndex('signal_history_change_dedupe_idx').on(table.source, table.metric, table.recordedAt),
  ],
);
