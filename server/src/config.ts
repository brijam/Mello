import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgresql://mello:changeme@localhost:5432/mello'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().default('change-this-to-a-random-string'),
  BASE_URL: z.string().default('http://localhost:3000'),
  STORAGE_PATH: z.string().default('./data/attachments'),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
