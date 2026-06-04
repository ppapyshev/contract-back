import {
  deleteGigaChatFile,
  gigachatChat,
  guessMimeType,
  isGigaChatEnabled,
  isOcrCandidate,
  uploadGigaChatFile,
  type GigaChatMessage,
} from './gigachat.service.js';

export type OcrFileInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

const OCR_PROMPT =
  'Распознай и верни полный текст документа дословно на русском языке. Сохрани абзацы и нумерацию пунктов. Верни только текст документа, без комментариев и пояснений.';

const OCR_PAGE_PROMPT =
  'Распознай и верни полный текст со страницы договора. Только текст, без комментариев.';

function isDocumentAttachment(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export async function extractTextWithGigaChatOcr(files: OcrFileInput[]): Promise<string> {
  if (!isGigaChatEnabled() || files.length === 0) {
    return '';
  }

  const uploadedIds: string[] = [];

  try {
    const entries = await Promise.all(
      files.map(async file => {
        const mimeType = guessMimeType(file.filename, file.mimeType);
        const id = await uploadGigaChatFile(file.buffer, file.filename, mimeType);
        uploadedIds.push(id);
        return { id, mimeType, filename: file.filename };
      }),
    );

    const documents = entries.filter(entry => isDocumentAttachment(entry.mimeType));
    const images = entries.filter(entry => entry.mimeType.startsWith('image/'));
    const parts: string[] = [];

    if (documents.length > 0) {
      const docText = await gigachatChat(
        [
          {
            role: 'user',
            content: OCR_PROMPT,
            attachments: documents.map(doc => doc.id),
          },
        ],
        { maxTokens: 8192, temperature: 0.1, functionCall: 'auto' },
      );

      if (docText.trim()) {
        parts.push(docText.trim());
      }
    }

    if (images.length > 0) {
      const imageMessages: GigaChatMessage[] = images.map((image, index) => ({
        role: 'user',
        content: index === 0 ? OCR_PROMPT : OCR_PAGE_PROMPT,
        attachments: [image.id],
      }));

      const imageText = await gigachatChat(imageMessages, {
        maxTokens: 8192,
        temperature: 0.1,
      });

      if (imageText.trim()) {
        parts.push(imageText.trim());
      }
    }

    return parts.join('\n\n').trim();
  } finally {
    await Promise.all(uploadedIds.map(id => deleteGigaChatFile(id).catch(() => undefined)));
  }
}

export { isOcrCandidate };
