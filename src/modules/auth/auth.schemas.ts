import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().email('Некорректный email'),
    password: z.string().min(8, 'Пароль минимум 8 символов'),
    passwordRepeat: z.string(),
    agreedToTerms: z
      .union([z.boolean(), z.string()])
      .transform(v => v === true || v === 'true' || v === '1' || v === 'on'),
  })
  .refine(data => data.password === data.passwordRepeat, {
    message: 'Пароли не совпадают',
    path: ['passwordRepeat'],
  })
  .refine(data => data.agreedToTerms, {
    message: 'Необходимо согласие с условиями',
    path: ['agreedToTerms'],
  });

export const loginEmailSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Введите пароль'),
  deviceId: z.string().optional(),
  deviceType: z.string().optional(),
});

export const loginLegacySchema = z.object({
  token: z.string().optional(),
  code: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
  deviceId: z.string().optional(),
  deviceType: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
