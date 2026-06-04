import fs from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { env } from '../../config/env.js';
import { requireAuth, getUserId } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError } from '../../lib/errors.js';

export async function filesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/files/upload', async (request, reply) => {
    const userId = getUserId(request);
    const data = await request.file();
    if (!data) throw new ForbiddenError('Файл не передан');

    const buffer = await data.toBuffer();
    const ext = path.extname(data.filename) || '.bin';
    const storedName = `${uuidv4()}${ext}`;
    const uploadPath = path.join(env.UPLOAD_DIR, storedName);
    await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
    await fs.writeFile(uploadPath, buffer);

    const file = await prisma.documentFile.create({
      data: {
        userId,
        filename: data.filename,
        mimeType: data.mimetype,
        size: buffer.length,
        path: uploadPath,
      },
    });

    return sendSuccess(reply, {
      id: file.id,
      filename: file.filename,
      fullUrl: `${env.PUBLIC_URL}/uploads/${storedName}`,
      mimeType: file.mimeType,
      size: file.size,
    }, 201);
  });
}
