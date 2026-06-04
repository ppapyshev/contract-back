import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  firstName: z.string().max(80).optional(),
  patronymic: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  notificationsOn: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().max(10).optional(),
});

export const onboardingSchema = z.object({
  roles: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
});
