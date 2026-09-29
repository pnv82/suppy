import { Encoder, Profile } from "@garmin/fitsdk";
import { crc32, deflateRawSync } from "node:zlib";

export function fitFixture({
  gps = true,
  sensors = true,
  records = true,
  paused = false,
  summary = {},
  record = (r) => r,
  start = "2026-09-27T14:00:00Z",
  timerEvents,
} = {}) {
  const encoder = new Encoder(),
    date = new Date(start);
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: "activity",
    manufacturer: "development",
    timeCreated: date,
  });
  if (!timerEvents)
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: date,
      event: "timer",
      eventType: "start",
    });
  if (records)
    for (let t = 0; t <= 1300; t += 5) {
      if (paused && t > 500 && t < 660) continue;
      const r = record(
        {
          timestamp: new Date(+date + t * 1000),
          distance: t * 2,
          speed: 2,
          ...(gps
            ? {
                positionLat: Math.round(((32.7 + t * 0.00001) / 180) * 2 ** 31),
                positionLong: Math.round((-117.2 / 180) * 2 ** 31),
              }
            : {}),
          ...(sensors ? { heartRate: 140, cadence: 30 } : {}),
        },
        t,
      );
      if (r) encoder.onMesg(Profile.MesgNum.RECORD, r);
    }
  if (paused && !timerEvents) {
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: new Date(+date + 500000),
      event: "timer",
      eventType: "stopAll",
    });
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: new Date(+date + 660000),
      event: "timer",
      eventType: "start",
    });
  }
  if (!timerEvents)
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: new Date(+date + 1300000),
      event: "timer",
      eventType: "stopAll",
    });
  for (const event of timerEvents || [])
    encoder.onMesg(Profile.MesgNum.EVENT, event);
  encoder.onMesg(Profile.MesgNum.SESSION, {
    sport: "standUpPaddleboarding",
    startTime: date,
    timestamp: new Date(+date + 1300000),
    totalElapsedTime: 1300,
    totalTimerTime: paused ? 1140 : 1300,
    totalDistance: 2600,
    avgSpeed: 2,
    ...(sensors ? { avgHeartRate: 140, avgCadence: 30, totalCycles: 650 } : {}),
    ...summary,
  });
  return Buffer.from(encoder.close());
}

// Synthetic classic ZIP. Production never uses this encoder.
export function zipFixture(bytes, { name = "activity.fit", method = 8 } = {}) {
  const filename = Buffer.from(name),
    compressed = method === 8 ? deflateRawSync(bytes) : bytes;
  const local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc32(bytes), 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(filename.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc32(bytes), 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(filename.length, 28);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}
export const uploadFixture = (options) => ({
  filename: "renamed.fit",
  data_base64: fitFixture(options).toString("base64"),
  timezone: "America/Los_Angeles",
});
