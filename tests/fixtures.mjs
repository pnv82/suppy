// Deliberately synthetic. No private activity files or historical snapshots needed.
import { createStore } from "../server/store.mjs";
import { openDatabase } from "../server/database.mjs";
import { bestWindows, sessionStatistics } from "../src/domain/metrics.mjs";

export function fixtureState() {
  const records = Array.from({ length: 1301 }, (_, t) => ({
    timestamp_utc: new Date(
      Date.parse("2026-09-25T14:00:00Z") + t * 1000,
    ).toISOString(),
    elapsed_s: t,
    distance_m: t * 2,
    latitude_deg: 32.7 + t * 0.00001,
    longitude_deg: -117.2,
    speed_mps: 2,
    heart_rate_bpm: 140,
    cadence_raw: 32,
  }));
  return {
    boards: [],
    defaultBoardId: null,
    sessions: ["24495535896", "24444079580", "24249467884", "24162211256"].map(
      (id, i) => {
        const points = i === 3 ? [] : records;
        return {
          id,
          date: ["2026-09-25", "2026-09-20", "2026-09-05", "2026-08-29"][i],
          title: "Synthetic launch",
          titleSource: "source_location",
          location: "Synthetic test location",
          timezone: "America/Los_Angeles",
          start: "07:00",
          end: "07:22",
          startUtc: i === 3 ? null : "2026-09-25T14:00:00Z",
          type: "Training",
          distance: 1.6,
          active: 1300 / 60,
          elapsed: 1300 / 60,
          avgSpeed: 4.5,
          avgHr: 140,
          cadence: 32,
          best5: 4.6,
          best10: 4.5,
          best20: 4.4,
          wind: i === 2 ? null : 0,
          windFrom: null,
          station: null,
          weatherQuality: "Synthetic fixture",
          hrQuality: null,
          benchmarkQuality: "legacy_unspecified",
          notes: "Synthetic test data",
          paddle: null,
          boardId: null,
          records: points,
          pauses: [],
          windows: bestWindows(points),
          statistics: sessionStatistics(
            points,
            [],
            points.length
              ? {
                  sport: "stand_up_paddleboarding",
                  enhanced_max_speed: 2.552,
                  total_distance: 2600,
                  total_strokes: 2860,
                }
              : null,
            175,
          ),
          annotations: [],
          additionalContext: "",
          technique: [],
          goal: { speed_mph: null, duration_min: 20 },
          revision: 0,
          sourceRef: "fixture:synthetic",
          hashes: null,
        };
      },
    ),
  };
}
export function testStore(t) {
  const database = openDatabase(":memory:");
  database.createTenant("test");
  database.importState("test", fixtureState());
  const store = createStore({ database, tenantId: "test", launchLookup: null });
  t?.after(() => database.close());
  return store;
}
