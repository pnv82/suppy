import { z } from "zod";
export const garminAuthSchemas = {
  login: z
    .object({
      username: z.string().trim().min(1).max(320),
      password: z.string().min(1).max(1024),
    })
    .strict(),
  verify: z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^[0-9]{4,10}$/),
    })
    .strict(),
};
export const garminSchemas = {
  get_garmin_status: z.object({}).strict(),
  disconnect_garmin: z.object({}).strict(),
  list_garmin_activities: z
    .object({ start: z.number().int().min(0).max(10000).default(0) })
    .strict(),
  preview_garmin_activity: z
    .object({
      activity_id: z.string().regex(/^[0-9]{1,20}$/),
      timezone: z.string().min(1).max(100),
    })
    .strict(),
  commit_garmin_activity: z
    .object({
      preview_id: z.uuid(),
      expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      target_session_id: z.string().nullable(),
      board_id: z.string().nullable(),
      launch_name: z.string().trim().max(100).optional(),
      launch_source_ref: z.string().max(300).nullable().optional(),
    })
    .strict(),
};
