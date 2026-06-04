import type { FastifyInstance } from 'fastify';

import { requireAuth, getUserId } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import { sendSuccess } from '../../lib/response.js';
import {
  registerByEmail,
  loginByEmail,
  createAccessToken,
  logoutUser,
  loginWithGoogle,
  loginWithTelegram,
  requestPasswordReset,
} from './auth.service.js';
import {
  registerSchema,
  loginEmailSchema,
  loginLegacySchema,
  forgotPasswordSchema,
} from './auth.schemas.js';

async function parseMultipartFields(request: { parts: () => AsyncIterableIterator<{ type: string; fieldname: string; value?: unknown }> }) {
  const fields: Record<string, string> = {};
  for await (const part of request.parts()) {
    if (part.type === 'field' && part.fieldname) {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return fields;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const user = await registerByEmail(body);
    const tokens = createAccessToken(app.jwt.sign.bind(app.jwt), user.id, user.email);
    return sendSuccess(reply, tokens, 201);
  });

  app.post('/auth/registration', async (request, reply) => {
    const fields = await parseMultipartFields(request);
    const body = registerSchema.parse({
      email: fields.email,
      password: fields.password,
      passwordRepeat: fields.passwordRepeat ?? fields.password,
      agreedToTerms: fields.agreedToTerms ?? fields.agreed,
    });
    const user = await registerByEmail(body);
    const tokens = createAccessToken(app.jwt.sign.bind(app.jwt), user.id, user.email);
    return sendSuccess(reply, tokens, 201);
  });

  app.post('/auth/login-email', async (request, reply) => {
    const body = loginEmailSchema.parse(request.body);
    const user = await loginByEmail(body);
    const tokens = createAccessToken(app.jwt.sign.bind(app.jwt), user.id, user.email);
    return sendSuccess(reply, tokens);
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginLegacySchema.parse(request.body);

    if (body.email && body.password) {
      const user = await loginByEmail({
        email: body.email,
        password: body.password,
        deviceId: body.deviceId,
        deviceType: body.deviceType,
      });
      const tokens = createAccessToken(app.jwt.sign.bind(app.jwt), user.id, user.email);
      return sendSuccess(reply, tokens);
    }

    throw new ValidationError({
      form: ['Укажите email и password, либо настройте SMS-авторизацию'],
    });
  });

  app.post('/auth/login/google', async (request, reply) => {
    const { idToken } = request.body as { idToken?: string };
    await loginWithGoogle(idToken ?? '');
    return sendSuccess(reply, {});
  });

  app.post('/auth/login/telegram', async (request, reply) => {
    const { initData } = request.body as { initData?: string };
    await loginWithTelegram(initData ?? '');
    return sendSuccess(reply, {});
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);
    const result = await requestPasswordReset(email);
    return sendSuccess(reply, result);
  });

  app.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    await logoutUser(getUserId(request));
    return sendSuccess(reply, { ok: true });
  });
}
