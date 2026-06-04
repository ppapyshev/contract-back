import type { FastifyInstance } from 'fastify';

import { requireAuth, getUserId } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { chatAboutDocumentWithAi, resolveDocumentText } from '../../services/document-ai.service.js';
import { isGigaChatEnabled } from '../../services/gigachat.service.js';

function mapChatMessage(message: { id: string; role: string; content: string; createdAt: Date }) {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function buildDocumentContext(doc: {
  title: string;
  type: string;
  summary: string | null;
  plainText: string | null;
  originalText: string | null;
  risks: Array<{ level: string; title: string; clause: string; explanation: string; suggestion: string }>;
}) {
  const risksText = doc.risks
    .map(r => `- [${r.level}] ${r.title} (${r.clause}): ${r.explanation}. Рекомендация: ${r.suggestion}`)
    .join('\n');

  return [
    `Название: ${doc.title}`,
    `Тип: ${doc.type}`,
    doc.summary ? `Резюме: ${doc.summary}` : '',
    doc.plainText ? `Простое объяснение: ${doc.plainText}` : '',
    doc.originalText ? `Текст: ${doc.originalText.slice(0, 8000)}` : '',
    risksText ? `Риски:\n${risksText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/documents/:id/chat/messages', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundError('Документ не найден');

    const messages = await prisma.docChatMessage.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(reply, messages.map(mapChatMessage));
  });

  app.post('/documents/:id/chat', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const { message } = request.body as { message?: string };

    if (!message?.trim()) {
      throw new ForbiddenError('Сообщение не может быть пустым');
    }

    const doc = await prisma.document.findFirst({
      where: { id, userId },
      include: { risks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!doc) throw new NotFoundError('Документ не найден');

    await prisma.docChatMessage.create({
      data: {
        documentId: id,
        role: 'user',
        content: message.trim(),
      },
    });

    let assistantContent =
      'ИИ временно недоступен. Посмотрите вкладки «Риски» и «Простой» по этому документу.';

    if (isGigaChatEnabled()) {
      try {
        const previous = await prisma.docChatMessage.findMany({
          where: { documentId: id },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });

        const history = previous.map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: m.content,
        }));

        const context =
          doc.status === 'completed'
            ? buildDocumentContext(doc)
            : await resolveDocumentText(id, doc.title);

        assistantContent = await chatAboutDocumentWithAi(context, history, message.trim());
      } catch (err) {
        console.error('GigaChat chat failed', id, err);
      }
    }

    const saved = await prisma.docChatMessage.create({
      data: {
        documentId: id,
        role: 'assistant',
        content: assistantContent,
      },
    });

    const replyMessage = mapChatMessage(saved);

    return sendSuccess(reply, {
      reply: replyMessage,
      message: replyMessage,
    });
  });
}
