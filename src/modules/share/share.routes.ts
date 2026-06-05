import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../../lib/errors.js';
import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import {
  mapPublicShare,
  renderShareHtml,
} from '../../services/document-export.service.js';

async function findSharedDocument(token: string) {
  const normalized = token.replace(/-/g, '');

  return prisma.document.findFirst({
    where: {
      status: 'completed',
      OR: [
        { shareToken: token },
        { shareToken: normalized },
        { id: token },
      ],
    },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function shareRoutes(app: FastifyInstance) {
  app.get('/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const doc = await findSharedDocument(token);

    if (!doc) throw new NotFoundError('Ссылка недействительна или документ недоступен');

    const accept = request.headers.accept ?? '';
    if (accept.includes('text/html')) {
      return reply.type('text/html; charset=utf-8').send(renderShareHtml(doc));
    }

    return sendSuccess(reply, mapPublicShare(doc));
  });
}
