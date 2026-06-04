import type { FastifyInstance } from 'fastify';

import { requireAuth, getUserId } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { mapUserProfile } from '../../services/user.mapper.js';
import { updateProfileSchema, onboardingSchema } from './user.schemas.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/user/profile', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: getUserId(request) } });
    if (!user) throw new NotFoundError('Пользователь не найден');
    return sendSuccess(reply, mapUserProfile(user));
  });

  app.patch('/user/profile', async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);
    const user = await prisma.user.update({
      where: { id: getUserId(request) },
      data: body,
    });
    return sendSuccess(reply, mapUserProfile(user));
  });

  app.post('/user/onboarding', async (request, reply) => {
    const body = onboardingSchema.parse(request.body);
    const user = await prisma.user.update({
      where: { id: getUserId(request) },
      data: {
        roles: body.roles,
        topics: body.topics,
        onboardingDone: true,
      },
    });
    return sendSuccess(reply, mapUserProfile(user));
  });

  app.delete('/user/documents', async (request, reply) => {
    const userId = getUserId(request);
    await prisma.document.deleteMany({ where: { userId } });
    return sendSuccess(reply, { deleted: true });
  });

  app.delete('/user/delete', async (request, reply) => {
    const userId = getUserId(request);
    await prisma.user.delete({ where: { id: userId } });
    return sendSuccess(reply, { deleted: true });
  });
}
