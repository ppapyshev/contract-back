import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../../lib/errors.js';
import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import {
  mapPublicShare,
  renderShareHtml,
} from '../../services/document-export.service.js';

export async function shareRoutes(app: FastifyInstance) {
  app.get('/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, status: 'completed' },
      include: { risks: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!doc) throw new NotFoundError('Ссылка недействительна или документ недоступен');

    const accept = request.headers.accept ?? '';
    if (accept.includes('text/html')) {
      return reply.type('text/html; charset=utf-8').send(renderShareHtml(doc));
    }

    return sendSuccess(reply, mapPublicShare(doc));
  });
}
