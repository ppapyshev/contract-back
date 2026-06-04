import type { FastifyInstance } from "fastify";

import { env } from "../../config/env.js";
import { requireAuth, getUserId } from "../../middleware/auth.js";
import { sendSuccess } from "../../lib/response.js";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError, ForbiddenError } from "../../lib/errors.js";
import {
  assertCanAnalyze,
  consumeAnalysis,
} from "../../services/plan.service.js";
import { runDocumentAnalysis } from "../../services/analysis.service.js";
import {
  mapDocument,
  mapDocumentCard,
} from "../../services/document.mapper.js";
import {
  documentsQuerySchema,
  updateDocumentSchema,
  createFromTemplateSchema,
  analyzeDocumentSchema,
  compareDocumentSchema,
} from "./documents.schemas.js";
import {
  resolveFilePublicUrl,
  saveDocumentFile,
} from "../../services/storage.service.js";

export async function documentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/documents", async (request, reply) => {
    const userId = getUserId(request);
    const q = documentsQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {
      userId,
      status: "completed",
    };

    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: "insensitive" } },
        { summary: { contains: q.search, mode: "insensitive" } },
      ];
    }
    if (q.type) where.type = q.type;
    if (q.risk) where.riskLevel = q.risk;

    const orderBy =
      q.sort === "date_asc"
        ? { createdAt: "asc" as const }
        : q.sort === "risk"
          ? [{ riskLevel: "desc" as const }, { createdAt: "desc" as const }]
          : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy,
        take: q.limit,
        skip: q.offset,
      }),
      prisma.document.count({ where }),
    ]);

    return sendSuccess(reply, {
      items: items.map(mapDocumentCard),
      total,
      limit: q.limit,
      offset: q.offset,
    });
  });

  app.get("/documents/recent", async (request, reply) => {
    const userId = getUserId(request);
    const items = await prisma.document.findMany({
      where: { userId, status: "completed" },
      orderBy: { analyzedAt: "desc" },
      take: 10,
    });
    return sendSuccess(reply, items.map(mapDocumentCard));
  });

  app.get("/documents/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({
      where: { id, userId },
      include: { risks: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) throw new NotFoundError("Документ не найден");
    return sendSuccess(reply, mapDocument(doc));
  });

  app.get("/documents/:id/status", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({
      where: { id, userId },
      select: { id: true, status: true, title: true },
    });
    if (!doc) throw new NotFoundError("Документ не найден");
    return sendSuccess(reply, doc);
  });

  app.patch("/documents/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = updateDocumentSchema.parse(request.body);

    const existing = await prisma.document.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Документ не найден");

    const doc = await prisma.document.update({
      where: { id },
      data: { title: body.title },
      include: { risks: { orderBy: { sortOrder: "asc" } } },
    });
    return sendSuccess(reply, mapDocument(doc));
  });

  app.put("/documents/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = updateDocumentSchema.parse(request.body);

    const existing = await prisma.document.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Документ не найден");

    const doc = await prisma.document.update({
      where: { id },
      data: { title: body.title },
      include: { risks: { orderBy: { sortOrder: "asc" } } },
    });
    return sendSuccess(reply, mapDocument(doc));
  });

  app.delete("/documents", async (request, reply) => {
    const userId = getUserId(request);
    await prisma.document.deleteMany({ where: { userId } });
    return sendSuccess(reply, { deleted: true });
  });

  app.delete("/documents/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.document.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Документ не найден");
    await prisma.document.delete({ where: { id } });
    return sendSuccess(reply, { deleted: true });
  });

  app.post("/documents/analyze", async (request, reply) => {
    const userId = getUserId(request);
    await assertCanAnalyze(userId);

    const body = analyzeDocumentSchema.parse(request.body);
    const files = await prisma.documentFile.findMany({
      where: { id: { in: body.fileIds }, userId, documentId: null },
    });

    if (files.length !== body.fileIds.length) {
      throw new ForbiddenError("Один или несколько файлов не найдены");
    }

    const title =
      files[0]!.filename.replace(/\.[^.]+$/, "") || files[0]!.filename;
    const isPdf = files.some((f) => f.mimeType.includes("pdf"));
    const fileUrl = resolveFilePublicUrl(files[0]!.path);

    const doc = await prisma.document.create({
      data: {
        userId,
        title,
        status: "pending",
        sourceType: isPdf ? "pdf" : "image",
        fileUrl,
        files: { connect: body.fileIds.map((id) => ({ id })) },
      },
    });

    await consumeAnalysis(userId);

    const textHint = files.map((f) => f.filename).join(", ");
    void runDocumentAnalysis(doc.id, textHint).catch((err) => {
      console.error("Analysis failed", doc.id, err);
      void prisma.document.update({
        where: { id: doc.id },
        data: { status: "failed" },
      });
    });

    return sendSuccess(reply, { id: doc.id, status: "processing" }, 201);
  });

  app.post("/documents/upload", async (request, reply) => {
    const userId = getUserId(request);
    await assertCanAnalyze(userId);

    const data = await request.file();
    if (!data) {
      throw new ForbiddenError("Файл не передан");
    }

    const buffer = await data.toBuffer();
    const title = (request.query as { title?: string }).title ?? data.filename;
    const { file, publicUrl } = await saveDocumentFile(
      userId,
      buffer,
      data.filename,
      data.mimetype,
    );

    const doc = await prisma.document.create({
      data: {
        userId,
        title,
        status: "pending",
        sourceType: data.mimetype?.includes("pdf") ? "pdf" : "image",
        fileUrl: publicUrl,
        files: { connect: { id: file.id } },
      },
    });

    await consumeAnalysis(userId);

    void runDocumentAnalysis(doc.id, data.filename).catch((err) => {
      console.error("Analysis failed", doc.id, err);
      void prisma.document.update({
        where: { id: doc.id },
        data: { status: "failed" },
      });
    });

    return sendSuccess(reply, { id: doc.id, status: "processing" }, 201);
  });

  app.post("/documents/from-template", async (request, reply) => {
    const userId = getUserId(request);
    await assertCanAnalyze(userId);

    const body = createFromTemplateSchema.parse(request.body);
    const template = await prisma.template.findUnique({
      where: { id: body.templateId },
    });
    if (!template) throw new NotFoundError("Шаблон не найден");

    const doc = await prisma.document.create({
      data: {
        userId,
        title: body.title ?? template.title,
        type: template.category,
        status: "pending",
        sourceType: "template",
        templateId: template.id,
        originalText: template.content,
      },
    });

    await consumeAnalysis(userId);
    void runDocumentAnalysis(doc.id, template.content).catch(console.error);

    return sendSuccess(reply, { id: doc.id, status: "processing" }, 201);
  });

  app.post("/documents/:id/reanalyze", async (request, reply) => {
    const userId = getUserId(request);
    await assertCanAnalyze(userId);

    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundError("Документ не найден");

    await consumeAnalysis(userId);
    void runDocumentAnalysis(doc.id, doc.originalText ?? "").catch(
      console.error,
    );

    return sendSuccess(reply, { id: doc.id, status: "processing" });
  });

  app.get("/documents/:id/export/pdf", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundError("Документ не найден");

    const base = env.PUBLIC_URL.replace(/\/$/, "");
    return sendSuccess(reply, {
      url: `${base}/documents/${id}/export/pdf/download`,
      message: "PDF-экспорт в разработке. Пока доступен текстовый отчёт.",
    });
  });

  app.get("/documents/:id/share", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundError("Документ не найден");

    const base = env.PUBLIC_URL.replace(/\/$/, "");
    return sendSuccess(reply, {
      url: `${base}/share/${id}`,
      title: doc.title,
    });
  });

  app.post("/documents/:id/compare", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    compareDocumentSchema.parse(request.body ?? {});

    const doc = await prisma.document.findFirst({
      where: { id, userId },
      include: { risks: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) throw new NotFoundError("Документ не найден");

    return sendSuccess(reply, mapDocument(doc));
  });

  app.post("/documents/:id/referral", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundError("Документ не найден");

    return sendSuccess(reply, {
      sent: true,
      message:
        "Заявка принята. Юрист свяжется с вами по email в течение 1–2 рабочих дней.",
      documentId: id,
      userId,
    });
  });
}
