import type { UserPlan } from '@prisma/client';

import { env } from '../config/env.js';
import { ForbiddenError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export async function getOrCreatePlan(userId: string): Promise<UserPlan> {
  const existing = await prisma.userPlan.findUnique({ where: { userId } });
  if (existing) {
    return resetPeriodIfNeeded(existing);
  }
  return prisma.userPlan.create({
    data: { userId, plan: 'free', used: 0, periodStart: new Date() },
  });
}

async function resetPeriodIfNeeded(plan: UserPlan): Promise<UserPlan> {
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  if (plan.plan === 'free' && plan.periodStart < monthAgo) {
    return prisma.userPlan.update({
      where: { id: plan.id },
      data: { used: 0, periodStart: new Date() },
    });
  }
  return plan;
}

export function isPremiumActive(plan: UserPlan): boolean {
  if (plan.plan !== 'premium') return false;
  if (!plan.premiumUntil) return true;
  return plan.premiumUntil > new Date();
}

export async function assertCanAnalyze(userId: string): Promise<UserPlan> {
  const plan = await getOrCreatePlan(userId);
  if (isPremiumActive(plan)) return plan;

  if (plan.used >= env.FREE_ANALYSES_PER_MONTH) {
    throw new ForbiddenError('Лимит бесплатных анализов исчерпан');
  }
  return plan;
}

export async function consumeAnalysis(userId: string): Promise<void> {
  const plan = await getOrCreatePlan(userId);
  if (isPremiumActive(plan)) return;

  await prisma.userPlan.update({
    where: { userId },
    data: { used: { increment: 1 } },
  });
}

export function formatPlanResponse(plan: UserPlan) {
  const premium = isPremiumActive(plan);
  return {
    plan: premium ? 'premium' : 'free',
    billing: plan.billing ?? undefined,
    used: plan.used,
    periodStart: plan.periodStart.toISOString(),
    premiumUntil: plan.premiumUntil?.toISOString(),
    limit: env.FREE_ANALYSES_PER_MONTH,
    remaining: premium ? null : Math.max(0, env.FREE_ANALYSES_PER_MONTH - plan.used),
    canAnalyze: premium || plan.used < env.FREE_ANALYSES_PER_MONTH,
  };
}
