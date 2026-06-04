import type { Document, DocRisk, RiskLevel } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import {
  analyzeDocumentWithAi,
  resolveDocumentText,
  toPrismaRiskLevel,
} from './document-ai.service.js';
import {
  classifyDocumentContent,
  hasContractHeuristics,
  isTextInsufficientForAnalysis,
} from './document-validation.service.js';
import { serializeError, userMessageFromError } from '../lib/errorUtil.js';
import { isGigaChatEnabled } from './gigachat.service.js';

const STUB_BY_TYPE: Record<string, { title: string; type: string; riskLevel: RiskLevel }> = {
  rent: { title: 'Договор аренды квартиры', type: 'Аренда', riskLevel: 'high' },
  services: { title: 'Договор оказания услуг', type: 'Услуги', riskLevel: 'medium' },
  work: { title: 'Трудовой договор', type: 'Работа', riskLevel: 'low' },
  default: { title: 'Проанализированный договор', type: 'Другое', riskLevel: 'medium' },
};

function detectStubType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('аренд') || lower.includes('найм')) return 'rent';
  if (lower.includes('услуг') || lower.includes('подряд') || lower.includes('фриланс')) return 'services';
  if (lower.includes('трудов')) return 'work';
  return 'default';
}

const RENT_RISKS = [
  {
    level: 'high' as RiskLevel,
    title: 'Одностороннее повышение арендной платы',
    clause: 'п. 3.4',
    explanation:
      'Арендодатель вправе повышать плату в любой момент, уведомив за 14 дней. Это невыгодно: рынок защищает арендатора при 30+ днях.',
    suggestion: 'Зафиксировать рост не чаще 1 раза в год и не более 10%.',
  },
  {
    level: 'high' as RiskLevel,
    title: 'Штраф за досрочное расторжение',
    clause: 'п. 5.2',
    explanation:
      'Если съезжаете раньше срока — теряете залог полностью, плюс месячная плата сверху.',
    suggestion: 'Договориться об уведомлении за 30 дней без штрафа.',
  },
  {
    level: 'medium' as RiskLevel,
    title: 'Возврат залога — без сроков',
    clause: 'п. 4.1',
    explanation: 'Срок возврата залога не указан. Может тянуться месяцами.',
    suggestion: 'Установить срок возврата — 7 рабочих дней после выезда.',
  },
];

const DEFAULT_RISKS = [
  {
    level: 'medium' as RiskLevel,
    title: 'Требует внимания',
    clause: '—',
    explanation: 'Документ содержит стандартные формулировки, которые стоит проверить с юристом.',
    suggestion: 'Уточнить спорные пункты у контрагента.',
  },
];

async function failDocument(
  documentId: string,
  reason: string,
  options?: { err?: unknown; code?: string },
) {
  const stored = options?.err ? serializeError(options.err) : null;
  return prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'failed',
      summary: reason,
      errorCode: options?.code ?? stored?.code ?? 'ANALYSIS_FAILED',
      errorDetail: stored?.detail ?? null,
      keyPoints: [],
      plainText: null,
      analyzedAt: new Date(),
    },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** Загруженный файл не является договором — отдельный статус для клиента */
async function rejectNotContract(documentId: string, reason: string, code = 'NOT_A_CONTRACT') {
  return prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'not_contract',
      summary: reason,
      errorCode: code,
      errorDetail: null,
      keyPoints: [],
      plainText: null,
      analyzedAt: new Date(),
    },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** Фоновый анализ упал — сохраняем причину в документ */
export async function handleBackgroundAnalysisFailure(
  documentId: string,
  err: unknown,
) {
  console.error('Document analysis failed', documentId, err);
  const fallback =
    'Не удалось обработать документ. Проверьте качество фото или загрузите PDF.';
  return failDocument(documentId, userMessageFromError(err, fallback), { err });
}

async function runStubAnalysis(documentId: string, text: string) {
  const stubKey = detectStubType(text);
  const meta = STUB_BY_TYPE[stubKey] ?? STUB_BY_TYPE.default;
  const risksData = stubKey === 'rent' ? RENT_RISKS : DEFAULT_RISKS;

  const summary =
    stubKey === 'rent'
      ? 'Договор найма жилья. Найдено несколько пунктов, требующих внимания: одностороннее повышение платы, штраф за досрочное расторжение и неясные условия возврата залога.'
      : 'Документ проанализирован. Обнаружены формулировки, которые рекомендуется уточнить перед подписанием.';

  const keyPoints =
    stubKey === 'rent'
      ? [
          'Срок — 11 месяцев, продление по согласию сторон',
          'Залог — 2 месячных платежа',
          'Коммунальные услуги — оплачивает арендатор',
        ]
      : ['Проверьте сроки исполнения', 'Уточните порядок оплаты', 'Обратите внимание на ответственность сторон'];

  const plain =
    stubKey === 'rent'
      ? 'Вы снимаете жильё на срок по договору. Платите аренду и залог. Есть риск одностороннего повышения платы и штрафа при досрочном выезде.'
      : 'Договор описывает права и обязанности сторон. Перед подписанием убедитесь, что сроки, оплата и ответственность вам понятны.';

  await prisma.docRisk.deleteMany({ where: { documentId } });

  return prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'completed',
      errorCode: null,
      errorDetail: null,
      title: meta.title,
      type: meta.type,
      riskLevel: meta.riskLevel,
      summary,
      keyPoints,
      plainText: plain,
      originalText: text,
      analyzedAt: new Date(),
      risks: {
        create: risksData.map((r, i) => ({ ...r, sortOrder: i })),
      },
    },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function runDocumentAnalysis(
  documentId: string,
  originalText?: string,
): Promise<Document & { risks: DocRisk[] }> {
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'processing' },
  });

  try {
    const text = await resolveDocumentText(documentId, originalText);

    if (!isTextInsufficientForAnalysis(text)) {
      await prisma.document.update({
        where: { id: documentId },
        data: { originalText: text.slice(0, 80_000) },
      });
    }

    const classification = await classifyDocumentContent(text);
    if (!classification.isContract) {
      return rejectNotContract(
        documentId,
        classification.reason ??
          'Загруженный файл не похож на договор. Пожалуйста, загрузите договор, соглашение или PDF.',
      );
    }

    if (isGigaChatEnabled()) {
      const ai = await analyzeDocumentWithAi(text, originalText);
      if (!ai) {
        return failDocument(documentId, 'Не удалось проанализировать документ. Попробуйте ещё раз.', {
          code: 'GIGACHAT_EMPTY',
        });
      }

      await prisma.docRisk.deleteMany({ where: { documentId } });

      return prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'completed',
          errorCode: null,
          errorDetail: null,
          title: ai.title,
          type: ai.type,
          riskLevel: toPrismaRiskLevel(ai.riskLevel),
          summary: ai.summary,
          keyPoints: ai.keyPoints,
          plainText: ai.plain,
          originalText: ai.original ?? text,
          analyzedAt: new Date(),
          risks: {
            create: ai.risks.map((r, i) => ({
              level: toPrismaRiskLevel(r.level),
              title: r.title,
              clause: r.clause,
              explanation: r.explanation,
              suggestion: r.suggestion,
              sortOrder: i,
            })),
          },
        },
        include: { risks: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    if (hasContractHeuristics(text)) {
      return runStubAnalysis(documentId, text);
    }

    return rejectNotContract(
      documentId,
      'Файл не похож на договор. Загрузите договор, соглашение или PDF с текстом.',
    );
  } catch (err) {
    return failDocument(
      documentId,
      userMessageFromError(
        err,
        'Не удалось обработать документ. Проверьте качество фото или загрузите PDF.',
      ),
      { err },
    );
  }
}
