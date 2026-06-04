import type { Document } from '@prisma/client';

import { shouldExposeErrorDetails } from '../lib/errorUtil.js';

export function mapDocumentStatus(doc: Pick<
  Document,
  'id' | 'status' | 'title' | 'summary' | 'errorCode' | 'errorDetail'
>) {
  const payload: {
    id: string;
    status: string;
    title: string;
    summary: string | null;
    errorCode?: string | null;
    errorDetail?: string | null;
  } = {
    id: doc.id,
    status: doc.status,
    title: doc.title,
    summary: doc.summary,
  };

  if (doc.status === 'failed') {
    payload.errorCode = doc.errorCode ?? null;
    if (shouldExposeErrorDetails() && doc.errorDetail) {
      payload.errorDetail = doc.errorDetail;
    }
  }

  return payload;
}
