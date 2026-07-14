import type { HealthDay, HealthIngest } from '@personal-dashboard/shared';
import type { Database } from './db/client.js';

interface HealthDayRow {
  date: string;
  steps?: number;
  watch_steps?: number;
  phone_steps?: number;
  active_energy_kcal?: number;
  exercise_minutes?: number;
  stand_hours?: number;
  heart_rate?: number;
  resting_heart_rate?: number;
  walking_heart_rate?: number;
  blood_oxygen_percent?: number;
  updated_at: string;
}

// postgres.js returns SQL NULL as `null`, but the wire schema's metrics are optional
// (undefined-only), not nullable — coalesce so an unset metric round-trips as absent.
function toHealthDay(row: HealthDayRow): HealthDay {
  return {
    date: row.date,
    steps: row.steps ?? undefined,
    watchSteps: row.watch_steps ?? undefined,
    phoneSteps: row.phone_steps ?? undefined,
    activeEnergyKcal: row.active_energy_kcal ?? undefined,
    exerciseMinutes: row.exercise_minutes ?? undefined,
    standHours: row.stand_hours ?? undefined,
    heartRate: row.heart_rate ?? undefined,
    restingHeartRate: row.resting_heart_rate ?? undefined,
    walkingHeartRate: row.walking_heart_rate ?? undefined,
    bloodOxygenPercent: row.blood_oxygen_percent ?? undefined,
  };
}

/** PostgreSQL-backed source of truth for Apple Health day rollups. */
export class HealthStore {
  constructor(
    private readonly database: Database,
    private readonly retentionDays: number,
  ) {}

  /** Upsert an additive sample while preserving independently reported device totals. */
  async ingest(sample: HealthIngest, today: string): Promise<HealthDay> {
    const date = sample.date ?? today;
    const defined = Object.fromEntries(
      Object.entries(sample).filter(([, value]) => value !== undefined),
    ) as HealthIngest;
    const sql = this.database.client;
    const [row] = await sql<HealthDayRow[]>`
      insert into health_days (
        date, steps, watch_steps, phone_steps, active_energy_kcal, exercise_minutes,
        stand_hours, heart_rate, resting_heart_rate, walking_heart_rate, blood_oxygen_percent
      ) values (
        ${date}, ${defined.steps ?? null}, ${defined.watchSteps ?? null}, ${defined.phoneSteps ?? null},
        ${defined.activeEnergyKcal ?? null}, ${defined.exerciseMinutes ?? null}, ${defined.standHours ?? null},
        ${defined.heartRate ?? null}, ${defined.restingHeartRate ?? null}, ${defined.walkingHeartRate ?? null},
        ${defined.bloodOxygenPercent ?? null}
      )
      on conflict (date) do update set
        watch_steps = coalesce(excluded.watch_steps, health_days.watch_steps),
        phone_steps = coalesce(excluded.phone_steps, health_days.phone_steps),
        active_energy_kcal = coalesce(excluded.active_energy_kcal, health_days.active_energy_kcal),
        exercise_minutes = coalesce(excluded.exercise_minutes, health_days.exercise_minutes),
        stand_hours = coalesce(excluded.stand_hours, health_days.stand_hours),
        heart_rate = coalesce(excluded.heart_rate, health_days.heart_rate),
        resting_heart_rate = coalesce(excluded.resting_heart_rate, health_days.resting_heart_rate),
        walking_heart_rate = coalesce(excluded.walking_heart_rate, health_days.walking_heart_rate),
        blood_oxygen_percent = coalesce(excluded.blood_oxygen_percent, health_days.blood_oxygen_percent),
        steps = case
          when coalesce(excluded.watch_steps, health_days.watch_steps, excluded.phone_steps, health_days.phone_steps) is not null
          then greatest(
            coalesce(excluded.watch_steps, health_days.watch_steps, 0),
            coalesce(excluded.phone_steps, health_days.phone_steps, 0)
          )
          else coalesce(excluded.steps, health_days.steps)
        end,
        updated_at = now()
      returning *
    `;
    await sql`
      delete from health_days
      where date < (
        select date from health_days order by date desc offset ${this.retentionDays - 1} limit 1
      )
    `;
    return toHealthDay(row);
  }

  async snapshot(today: string): Promise<{ today: HealthDay | null; history: HealthDay[]; updatedAt: string | null }> {
    const rows = await this.database.client<HealthDayRow[]>`
      select * from health_days order by date asc
    `;
    const history = rows.map(toHealthDay);
    const updatedAt = rows.reduce<string | undefined>(
      (latest, row) => (!latest || Date.parse(row.updated_at) > Date.parse(latest) ? row.updated_at : latest),
      undefined,
    );
    return {
      today: history.find((day) => day.date === today) ?? null,
      history,
      updatedAt: updatedAt ?? null,
    };
  }
}
