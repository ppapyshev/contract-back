import fs from 'node:fs';
import path from 'node:path';

import cors from '@fastify/cors';
import fjwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { shareRoutes } from './modules/share/share.routes.js';
import { planRoutes } from './modules/plan/plan.routes.js';
import { systemRoutes } from './modules/system/system.routes.js';
// import { templatesRoutes } from './modules/templates/templates.routes.js';
import { userRoutes } from './modules/user/user.routes.js';

export async function buildApp() {
  fs.mkdirSync(path.resolve(env.UPLOAD_DIR), { recursive: true });

  const app = Fastify({
    logger: env.NODE_ENV !== 'production',
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });
  await app.register(fastifyStatic, {
    root: path.resolve(env.UPLOAD_DIR),
    prefix: '/uploads/',
    decorateReply: false,
  });

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => ({ ok: true, service: 'contract-back' }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(documentsRoutes);
  await app.register(chatRoutes);
  // await app.register(templatesRoutes);
  await app.register(shareRoutes);
  await app.register(planRoutes);
  await app.register(systemRoutes);
  await app.register(filesRoutes);

  return app;
}
