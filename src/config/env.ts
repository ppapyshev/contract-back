import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('30d'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  FREE_ANALYSES_PER_MONTH: z.coerce.number().default(3),
  /** Email через запятую — без лимита анализов (например steeleltt@gmail.com) */
  UNLIMITED_EMAILS: z.string().optional(),
  STORAGE_MODE: z.enum(['database', 'local', 's3']).default('database'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  GIGACHAT_AUTH_KEY: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
  GIGACHAT_MODEL: z.string().default('GigaChat'),
  GIGACHAT_OAUTH_URL: z
    .string()
    .default('https://ngw.devices.sberbank.ru:9443/api/v2/oauth'),
  GIGACHAT_API_URL: z
    .string()
    .default('https://gigachat.devices.sberbank.ru/api/v1'),
  /** true — в ответах API отдавать detail/stack; false — скрыть в production */
  EXPOSE_ERROR_DETAILS: z
    .enum(['true', 'false'])
    .optional(),
});

export const env = envSchema.parse(process.env);
