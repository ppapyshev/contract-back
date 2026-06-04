import type { FastifyInstance } from 'fastify';

import { requireAuth, getUserId } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { getOrCreatePlan, formatPlanResponse } from '../../services/plan.service.js';
import { prisma } from '../../lib/prisma.js';

export async function planRoutes(app: FastifyInstance) {
  app.get('/plan', { preHandler: [requireAuth] }, async (request, reply) => {
    const plan = await getOrCreatePlan(getUserId(request));
    return sendSuccess(reply, await formatPlanResponse(plan));
  });

  app.post('/plan/subscribe', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = getUserId(request);
    const { billing } = request.body as { billing?: 'monthly' | 'yearly' };

    const premiumUntil = new Date();
    premiumUntil.setMonth(premiumUntil.getMonth() + (billing === 'yearly' ? 12 : 1));

    const plan = await prisma.userPlan.upsert({
      where: { userId },
      create: {
        userId,
        plan: 'premium',
        billing: billing ?? 'monthly',
        premiumUntil,
      },
      update: {
        plan: 'premium',
        billing: billing ?? 'monthly',
        premiumUntil,
      },
    });

    return sendSuccess(reply, {
      ...(await formatPlanResponse(plan)),
      message: 'Подписка активирована (тестовый режим, без оплаты)',
    });
  });

  app.post('/plan/cancel', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = getUserId(request);
    const plan = await prisma.userPlan.update({
      where: { userId },
      data: { plan: 'free', billing: null, premiumUntil: null },
    });
    return sendSuccess(reply, await formatPlanResponse(plan));
  });
}
