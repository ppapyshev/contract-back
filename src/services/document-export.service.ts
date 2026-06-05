import { createRequire } from 'node:module';
import path from 'node:path';

import type { DocRisk, Document } from '@prisma/client';
import PDFDocument from 'pdfkit';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { mapDocument } from './document.mapper.js';

const require = createRequire(import.meta.url);
const DEJAVU_FONT = path.join(
  path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),
  'ttf/DejaVuSans.ttf',
);

const RISK_LABELS: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

export function buildPdfFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);

  return base.endsWith('.pdf') ? base : `${base || 'document'}.pdf`;
}

export async function getOwnedCompletedDocument(userId: string, id: string) {
  const doc = await prisma.document.findFirst({
    where: { id, userId },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!doc) throw new NotFoundError('Документ не найден');
  if (doc.status !== 'completed') {
    throw new ForbiddenError('Экспорт доступен только для проанализированных документов');
  }

  return doc;
}

export async function ensureShareToken(
  doc: Document,
): Promise<string> {
  if (doc.shareToken) return doc.shareToken;

  const { randomUUID } = await import('node:crypto');
  const shareToken = randomUUID().replace(/-/g, '');

  await prisma.document.update({
    where: { id: doc.id },
    data: { shareToken },
  });

  return shareToken;
}

export function buildExportPdfUrl(documentId: string): string {
  const base = env.PUBLIC_URL.replace(/\/$/, '');
  return `${base}/documents/${documentId}/export/pdf/download`;
}

export function buildShareUrl(shareToken: string): string {
  const base = env.PUBLIC_URL.replace(/\/$/, '');
  return `${base}/share/${shareToken}`;
}

export async function buildDocumentPdfBuffer(
  doc: Document & { risks: DocRisk[] },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({ margin: 48, size: 'A4' });

    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    pdf.registerFont('main', DEJAVU_FONT);
    pdf.font('main');

    pdf.fontSize(20).text(doc.title, { underline: true });
    pdf.moveDown(0.5);
    pdf.fontSize(11).fillColor('#444444').text(`Тип: ${doc.type}`);
    pdf.text(`Уровень риска: ${RISK_LABELS[doc.riskLevel ?? 'low'] ?? doc.riskLevel}`);
    if (doc.analyzedAt) {
      pdf.text(`Дата анализа: ${doc.analyzedAt.toLocaleDateString('ru-RU')}`);
    }
    pdf.moveDown();

    pdf.fillColor('#000000').fontSize(14).text('Краткое резюме');
    pdf.fontSize(11).text(doc.summary ?? '—', { align: 'left' });
    pdf.moveDown();

    if (doc.keyPoints.length > 0) {
      pdf.fontSize(14).text('Ключевые моменты');
      pdf.fontSize(11);
      for (const point of doc.keyPoints) {
        pdf.text(`• ${point}`);
      }
      pdf.moveDown();
    }

    if (doc.plainText?.trim()) {
      pdf.fontSize(14).text('Простым языком');
      pdf.fontSize(11).text(doc.plainText, { align: 'left' });
      pdf.moveDown();
    }

    if (doc.risks.length > 0) {
      pdf.fontSize(14).text('Риски');
      pdf.fontSize(11);
      for (const risk of doc.risks) {
        pdf.moveDown(0.3);
        pdf.text(
          `${risk.title} (${RISK_LABELS[risk.level] ?? risk.level}, ${risk.clause})`,
          { continued: false },
        );
        pdf.text(risk.explanation);
        pdf.text(`Рекомендация: ${risk.suggestion}`, { indent: 12 });
      }
    }

    pdf.moveDown();
    pdf.fontSize(9).fillColor('#666666').text(
      'Отчёт сформирован сервисом «Простой Договор». Не является юридической консультацией.',
      { align: 'center' },
    );

    pdf.end();
  });
}

export function mapPublicShare(
  doc: Document & { risks: DocRisk[] },
) {
  const mapped = mapDocument(doc);
  return {
    title: mapped.title,
    type: mapped.type,
    riskLevel: mapped.riskLevel,
    summary: mapped.summary,
    keyPoints: mapped.keyPoints,
    plain: mapped.plain,
    risks: mapped.risks,
    analyzedAt: mapped.analyzedAt,
  };
}

export function renderShareHtml(doc: Document & { risks: DocRisk[] }): string {
  const data = mapPublicShare(doc);
  const risksHtml = data.risks
    .map(
      r => `
        <section class="risk">
          <h3>${escapeHtml(r.title)} <span>${escapeHtml(r.clause)}</span></h3>
          <p>${escapeHtml(r.explanation)}</p>
          <p class="hint"><strong>Рекомендация:</strong> ${escapeHtml(r.suggestion)}</p>
        </section>`,
    )
    .join('');

  const keyPointsHtml = data.keyPoints
    .map(p => `<li>${escapeHtml(p)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f6f7f8; color: #111; }
    main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
    .card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 16px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    .risk h3 { margin: 0 0 8px; font-size: 16px; }
    .risk span { color: #666; font-weight: normal; }
    .hint { color: #0d7a5f; }
    footer { text-align: center; color: #888; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>${escapeHtml(data.title)}</h1>
      <div class="meta">${escapeHtml(data.type)} · риск: ${escapeHtml(data.riskLevel)}</div>
      <h2>Резюме</h2>
      <p>${escapeHtml(data.summary)}</p>
    </div>
    ${
      data.keyPoints.length
        ? `<div class="card"><h2>Ключевые моменты</h2><ul>${keyPointsHtml}</ul></div>`
        : ''
    }
    ${
      data.plain
        ? `<div class="card"><h2>Простым языком</h2><p>${escapeHtml(data.plain)}</p></div>`
        : ''
    }
    ${
      data.risks.length
        ? `<div class="card"><h2>Риски</h2>${risksHtml}</div>`
        : ''
    }
    <footer>Отчёт «Простой Договор». Не заменяет консультацию юриста.</footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
