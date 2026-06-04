import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { env } from '../../config/env.js';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getOrCreatePlan } from '../../services/plan.service.js';

const SALT_ROUNDS = 10;

export async function registerByEmail(input: {
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ValidationError({ email: ['Email уже зарегистрирован'] });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      provider: 'EMAIL',
      name: input.email.split('@')[0],
    },
  });

  await getOrCreatePlan(user.id);
  return user;
}

export async function loginByEmail(input: {
  email: string;
  password: string;
  deviceId?: string;
  deviceType?: string;
}) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash) {
    throw new UnauthorizedError('Неверный email или пароль');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Неверный email или пароль');
  }

  if (input.deviceId && input.deviceType) {
    await prisma.device.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: input.deviceId } },
      create: {
        userId: user.id,
        deviceId: input.deviceId,
        deviceType: input.deviceType,
      },
      update: { deviceType: input.deviceType },
    });
  }

  return user;
}

export function createAccessToken(
  sign: (payload: { sub: string; email?: string }) => string,
  userId: string,
  email?: string | null,
) {
  const accessToken = sign({ sub: userId, email: email ?? undefined });
  return { type: 'Bearer', accessToken };
}

export async function logoutUser(userId: string) {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export async function loginWithGoogle(_idToken: string) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ForbiddenError('Вход через Google пока не настроен на сервере');
  }
  throw new ForbiddenError('Вход через Google — в разработке');
}

export async function loginWithTelegram(_initData: string) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new ForbiddenError('Вход через Telegram пока не настроен на сервере');
  }
  throw new ForbiddenError('Вход через Telegram — в разработке');
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { sent: true };
  }
  // TODO: отправка письма со ссылкой сброса
  const token = uuidv4();
  console.info(`[dev] Password reset token for ${email}: ${token}`);
  return { sent: true };
}
