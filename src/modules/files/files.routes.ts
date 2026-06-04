import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { requireAuth, getUserId } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import {
  getFilePublicUrl,
  readDocumentFileContent,
  saveDocumentFile,
} from '../../services/storage.service.js';

function mapFileResponse(file: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
}) {
  return {
    id: file.id,
    uuid: file.id,
    fileName: file.filename,
    filename: file.filename,
    fullUrl: getFilePublicUrl(file.id),
    extension: path.extname(file.filename).replace('.', ''),
    mimeType: file.mimeType,
    size: file.size,
  };
}

export async function filesRoutes(app: FastifyInstance) {
  app.get('/files/:id/content', { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const content = await readDocumentFileContent(id, userId);
    if (!content) {
      throw new NotFoundError('Файл не найден');
    }

    return reply
      .header('Content-Type', content.mimeType)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(content.filename)}"`)
      .send(content.buffer);
  });

  app.post('/files/upload', { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const data = await request.file();
    if (!data) throw new ForbiddenError('Файл не передан');

    const buffer = await data.toBuffer();
    const { file } = await saveDocumentFile(userId, buffer, data.filename, data.mimetype);

    return sendSuccess(reply, mapFileResponse(file), 201);
  });

  app.post('/files/upload-multiple', { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const parts = request.files();
    const uploaded = [];

    for await (const part of parts) {
      const buffer = await part.toBuffer();
      const { file } = await saveDocumentFile(userId, buffer, part.filename, part.mimetype);
      uploaded.push(mapFileResponse(file));
    }

    if (uploaded.length === 0) {
      throw new ForbiddenError('Файлы не переданы');
    }

    return sendSuccess(reply, uploaded, 201);
  });
}
