import { z } from 'zod';

import { gigachatChat, isGigaChatEnabled } from './gigachat.service.js';

const classificationSchema = z.object({
  isContract: z.boolean(),
  reason: z.string().optional(),
});

const CLASSIFY_PROMPT = `Ты проверяешь, подходит ли текст для сервиса анализа договоров.
Ответь ТОЛЬКО JSON без markdown:
{"isContract": true}
или
{"isContract": false, "reason": "краткое объяснение по-русски"}

Договором считаются: договор, соглашение, оферта, контракт, акт, приложение с условиями, юридический документ со сторонами и обязательствами.

НЕ договор: фото природы, людей, животных, еды, мемы, скриншоты мессенджеров, реклама, инструкции, стихи, новости, описание картинки без юридического текста.`;

const CONTRACT_KEYWORDS = [
  'договор',
  'соглашени',
  'контракт',
  'оферт',
  'сторон',
  'исполнител',
  'заказчик',
  'арендодател',
  'арендатор',
  'подряд',
  'обязует',
  'предмет договор',
  'раздел ',
  'статья ',
  'пункт ',
  'подпис',
];

const UNAVAILABLE_MARKERS = [
  'Текст договора недоступен',
  '[Вложение:',
  '[Файл:',
];

export function isTextInsufficientForAnalysis(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (UNAVAILABLE_MARKERS.some(marker => trimmed.includes(marker))) return true;

  const normalized = trimmed.replace(/\s+/g, ' ');
  return normalized.length < 80;
}

export function hasContractHeuristics(text: string): boolean {
  const lower = text.toLowerCase();
  const hits = CONTRACT_KEYWORDS.filter(keyword => lower.includes(keyword)).length;
  return hits >= 2 && text.replace(/\s+/g, ' ').trim().length >= 120;
}

export async function classifyDocumentContent(
  text: string,
): Promise<{ isContract: boolean; reason?: string }> {
  if (isTextInsufficientForAnalysis(text)) {
    return {
      isContract: false,
      reason: 'Не удалось распознать достаточно текста. Загрузите чёткое фото страницы договора или PDF.',
    };
  }

  if (!isGigaChatEnabled()) {
    return hasContractHeuristics(text)
      ? { isContract: true }
      : {
          isContract: false,
          reason: 'Файл не похож на договор. Загрузите договор, соглашение или PDF с текстом.',
        };
  }

  const raw = await gigachatChat(
    [
      { role: 'system', content: CLASSIFY_PROMPT },
      {
        role: 'user',
        content: `Текст для проверки:\n\n${text.slice(0, 12_000)}`,
      },
    ],
    { maxTokens: 200, temperature: 0 },
  );

  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;

  try {
    const parsed = classificationSchema.safeParse(JSON.parse(jsonText));
    if (parsed.success) {
      return {
        isContract: parsed.data.isContract,
        reason: parsed.data.reason,
      };
    }
  } catch {
    // fall through
  }

  return hasContractHeuristics(text)
    ? { isContract: true }
    : {
        isContract: false,
        reason: 'Не удалось определить тип документа. Загрузите договор или соглашение.',
      };
}
