import type { DocRisk, Document } from '@prisma/client';

import { formatRelativeDate } from '../lib/date.js';

export function mapDocument(doc: Document & { risks?: DocRisk[] }) {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    date: doc.analyzedAt ? formatRelativeDate(doc.analyzedAt) : formatRelativeDate(doc.createdAt),
    riskLevel: doc.riskLevel ?? 'low',
    summary: doc.summary ?? '',
    status: doc.status,
    risks: (doc.risks ?? []).map(r => ({
      level: r.level,
      title: r.title,
      clause: r.clause,
      explanation: r.explanation,
      suggestion: r.suggestion,
    })),
    keyPoints: doc.keyPoints,
    plain: doc.plainText ?? '',
    original: doc.originalText ?? '',
    analyzedAt: doc.analyzedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    ...(doc.status === 'failed' || doc.status === 'not_contract'
      ? { errorCode: doc.errorCode ?? null }
      : {}),
  };
}

export function mapDocumentCard(doc: Document) {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    date: doc.analyzedAt ? formatRelativeDate(doc.analyzedAt) : formatRelativeDate(doc.createdAt),
    riskLevel: doc.riskLevel ?? 'low',
    summary: doc.summary ?? '',
    status: doc.status,
  };
}
