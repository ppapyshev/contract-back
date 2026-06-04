import type { FastifyInstance } from 'fastify';

import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';

export async function templatesRoutes(app: FastifyInstance) {
  app.get('/templates', async (_request, reply) => {
    const items = await prisma.template.findMany({
      orderBy: [{ popular: 'desc' }, { sortOrder: 'asc' }],
    });
    return sendSuccess(
      reply,
      items.map(t => ({
        id: t.id,
        title: t.title,
        icon: t.icon,
        color: t.color,
        category: t.category,
        description: t.description,
        popular: t.popular,
      })),
    );
  });

  app.get('/templates/popular', async (_request, reply) => {
    const items = await prisma.template.findMany({
      where: { popular: true },
      orderBy: { sortOrder: 'asc' },
      take: 6,
    });
    return sendSuccess(
      reply,
      items.map(t => ({
        id: t.id,
        title: t.title,
        icon: t.icon,
        color: t.color,
        category: t.category,
      })),
    );
  });

  app.get('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundError('Шаблон не найден');
    return sendSuccess(reply, {
      id: template.id,
      title: template.title,
      icon: template.icon,
      color: template.color,
      category: template.category,
      description: template.description,
      content: template.content,
    });
  });
}
