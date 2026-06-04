import type { FastifyInstance } from 'fastify';

import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/system/settings', async (_request, reply) => {
    return sendSuccess(reply, {
      checkMinorVersion: false,
      enableSentry: false,
    });
  });

  app.get('/system/docs', async (_request, reply) => {
    const docs = await prisma.systemDoc.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true, content: true },
    });
    return sendSuccess(reply, docs);
  });

  app.get('/system/docs/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const doc = await prisma.systemDoc.findUnique({ where: { slug } });
    if (!doc) throw new NotFoundError('Документ не найден');
    return sendSuccess(reply, { slug: doc.slug, title: doc.title, content: doc.content });
  });
}
