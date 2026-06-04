import type { RiskLevel } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { extractTextWithGigaChatOcr, isOcrCandidate } from "./ocr.service.js";
import { readDocumentFileContent } from "./storage.service.js";
import {
  extractJsonFromResponse,
  gigachatChat,
  isGigaChatEnabled,
  type GigaChatMessage,
} from "./gigachat.service.js";

const riskLevelSchema = z.enum(["high", "medium", "low"]);

export const documentAnalysisSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.string().min(1).max(100),
  riskLevel: riskLevelSchema,
  summary: z.string().min(1),
  keyPoints: z.array(z.string()).min(1).max(10),
  plain: z.string().min(1),
  original: z.string().optional(),
  risks: z
    .array(
      z.object({
        level: riskLevelSchema,
        title: z.string().min(1),
        clause: z.string().min(1),
        explanation: z.string().min(1),
        suggestion: z.string().min(1),
      }),
    )
    .min(1)
    .max(12),
});

export type DocumentAnalysisResult = z.infer<typeof documentAnalysisSchema>;

const ANALYSIS_SYSTEM_PROMPT = `Ты — юридический ассистент сервиса «Простой Договор» для обычных людей в России.
Проанализируй договор и верни ТОЛЬКО валидный JSON без markdown и комментариев.
Формат:
{
  "title": "краткое название",
  "type": "Аренда|Услуги|Работа|Другое",
  "riskLevel": "high|medium|low",
  "summary": "2-4 предложения",
  "keyPoints": ["..."],
  "plain": "простое объяснение договора простым языком",
  "original": "краткая выдержка или пересказ текста",
  "risks": [
    {
      "level": "high|medium|low",
      "title": "название риска",
      "clause": "пункт или —",
      "explanation": "почему это риск",
      "suggestion": "что предложить контрагенту"
    }
  ]
}
Пиши по-русски. Используй ТОЛЬКО факты из предоставленного текста.
Не выдумывай пункты, суммы, даты и условия, которых нет в документе.
Если текст не является договором — не анализируй, это обрабатывается отдельно.`;

const CHAT_SYSTEM_PROMPT = `Ты — ИИ-помощник по договору в приложении «Простой Договор».
Отвечай кратко, по-русски, простым языком. Ссылайся на пункты договора, если они есть в контексте.
Не заменяешь юриста — напоминай об этом при серьёзных рисках.`;

export async function resolveDocumentText(
  documentId: string,
  hint?: string,
): Promise<string> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { files: true },
  });

  if (doc?.originalText?.trim()) {
    return doc.originalText.trim().slice(0, 80_000);
  }

  const textParts: string[] = [];
  const ocrFiles: Array<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }> = [];

  for (const file of doc?.files ?? []) {
    const content = await readDocumentFileContent(file.id);
    if (!content) {
      textParts.push(`[Файл: ${file.filename}]`);
      continue;
    }

    if (
      content.mimeType.startsWith("text/") ||
      content.filename.endsWith(".txt") ||
      content.filename.endsWith(".md")
    ) {
      textParts.push(content.buffer.toString("utf-8").slice(0, 50_000));
    } else if (
      isOcrCandidate(content.mimeType, content.filename) &&
      isGigaChatEnabled()
    ) {
      ocrFiles.push({
        buffer: content.buffer,
        filename: content.filename,
        mimeType: content.mimeType,
      });
    } else {
      textParts.push(
        `[Вложение: ${content.filename}, тип ${content.mimeType}]`,
      );
    }
  }

  if (ocrFiles.length > 0) {
    try {
      const ocrText = await extractTextWithGigaChatOcr(ocrFiles);
      if (ocrText.trim()) {
        textParts.unshift(ocrText.trim());
      }
    } catch (err) {
      console.error("GigaChat OCR failed", documentId, err);
    }
  }

  if (textParts.length > 0) {
    return textParts.join("\n\n").slice(0, 80_000);
  }

  return (
    hint?.trim() ||
    doc?.title ||
    "Текст договора недоступен. Загрузите фото, PDF или текстовый файл."
  );
}

export async function analyzeDocumentWithAi(
  documentText: string,
  hint?: string,
): Promise<DocumentAnalysisResult | null> {
  if (!isGigaChatEnabled()) {
    return null;
  }

  const userContent = [
    hint ? `Подсказка / имя файла: ${hint}` : "",
    "Текст договора:",
    documentText.slice(0, 60_000),
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: GigaChatMessage[] = [
    { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const raw = await gigachatChat(messages, {
    maxTokens: 4096,
    temperature: 0.2,
  });
  const jsonText = extractJsonFromResponse(raw);

  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new Error("GigaChat returned non-JSON analysis response");
  }

  const parsed = documentAnalysisSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`Invalid GigaChat analysis JSON: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function chatAboutDocumentWithAi(
  documentContext: string,
  history: GigaChatMessage[],
  userMessage: string,
): Promise<string> {
  const messages: GigaChatMessage[] = [
    {
      role: "system",
      content: `${CHAT_SYSTEM_PROMPT}\n\nКонтекст документа:\n${documentContext.slice(0, 12_000)}`,
    },
    ...history.filter((m) => m.role !== "system"),
    { role: "user", content: userMessage },
  ];

  return gigachatChat(messages, { maxTokens: 1024, temperature: 0.4 });
}

export function toPrismaRiskLevel(
  level: DocumentAnalysisResult["riskLevel"],
): RiskLevel {
  return level;
}
