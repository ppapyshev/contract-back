import type { Document, DocRisk, RiskLevel } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

/** Заглушка анализа до подключения AI/OCR. Имитирует результат из mockDocuments. */
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

export async function runDocumentAnalysis(documentId: string, originalText?: string): Promise<Document & { risks: DocRisk[] }> {
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'processing' },
  });

  await delay(1500);

  const text = originalText ?? '';
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

  const doc = await prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'completed',
      title: meta.title,
      type: meta.type,
      riskLevel: meta.riskLevel,
      summary,
      keyPoints,
      plainText: plain,
      originalText: text || 'Текст документа будет доступен после подключения OCR.',
      analyzedAt: new Date(),
      risks: {
        create: risksData.map((r, i) => ({ ...r, sortOrder: i })),
      },
    },
    include: { risks: { orderBy: { sortOrder: 'asc' } } },
  });

  return doc;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
