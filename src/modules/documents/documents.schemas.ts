import { z } from 'zod';

export const documentsQuerySchema = z.object({
  search: z.string().optional(),
  type: z.string().optional(),
  risk: z.enum(['high', 'medium', 'low']).optional(),
  sort: z.enum(['date_desc', 'date_asc', 'risk']).default('date_desc'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(300),
});

export const analyzeDocumentSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1),
});

export const compareDocumentSchema = z.object({
  documentId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
});

export const createFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().max(300).optional(),
});
