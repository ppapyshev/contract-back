import { randomUUID } from 'node:crypto';
import https from 'node:https';
import path from 'node:path';

import { env } from '../config/env.js';

export type GigaChatRole = 'system' | 'user' | 'assistant';

export type GigaChatMessage = {
  role: GigaChatRole;
  content: string;
  attachments?: string[];
};

type OAuthResponse = {
  access_token: string;
  expires_at?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type UploadFileResponse = {
  id: string;
  filename?: string;
};

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export function isGigaChatEnabled(): boolean {
  return Boolean(env.GIGACHAT_AUTH_KEY);
}

function httpsRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string | Buffer },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method,
        headers: options.headers,
        agent: insecureAgent,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );

    req.on('error', reject);

    if (options.body !== undefined) {
      req.write(options.body);
    }

    req.end();
  });
}

function buildMultipartBody(
  boundary: string,
  parts: Array<{ name: string; filename?: string; contentType?: string; body: Buffer | string }>,
): Buffer {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));

    if (part.filename) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
    }

    chunks.push(Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body));
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

export async function getGigaChatAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const response = await httpsRequest(env.GIGACHAT_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: randomUUID(),
      Authorization: `Basic ${env.GIGACHAT_AUTH_KEY}`,
    },
    body: new URLSearchParams({ scope: env.GIGACHAT_SCOPE }).toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GigaChat OAuth error ${response.status}: ${response.body}`);
  }

  const data = JSON.parse(response.body) as OAuthResponse;
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + 30 * 60 * 1000;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt,
  };

  return data.access_token;
}

export async function uploadGigaChatFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const token = await getGigaChatAccessToken();
  const boundary = `----formdata-${randomUUID()}`;
  const body = buildMultipartBody(boundary, [
    { name: 'file', filename, contentType: mimeType, body: buffer },
    { name: 'purpose', body: 'general' },
  ]);

  const response = await httpsRequest(`${env.GIGACHAT_API_URL}/files`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GigaChat upload error ${response.status}: ${response.body}`);
  }

  const data = JSON.parse(response.body) as UploadFileResponse;
  if (!data.id) {
    throw new Error('GigaChat upload returned no file id');
  }

  return data.id;
}

export async function deleteGigaChatFile(fileId: string): Promise<void> {
  const token = await getGigaChatAccessToken();

  await httpsRequest(`${env.GIGACHAT_API_URL}/files/${fileId}/delete`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function gigachatChat(
  messages: GigaChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    functionCall?: 'auto';
  },
): Promise<string> {
  const token = await getGigaChatAccessToken();

  const payload: Record<string, unknown> = {
    model: options?.model ?? env.GIGACHAT_MODEL,
    messages,
    stream: false,
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature ?? 0.2,
  };

  if (options?.functionCall) {
    payload.function_call = options.functionCall;
  }

  const response = await httpsRequest(`${env.GIGACHAT_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GigaChat chat error ${response.status}: ${response.body}`);
  }

  const data = JSON.parse(response.body) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

export function extractJsonFromResponse(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

export function guessMimeType(filename: string, mimeType: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') {
    return mimeType;
  }

  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
  };

  return map[ext] ?? mimeType ?? 'application/octet-stream';
}

export function isOcrCandidate(mimeType: string, filename: string): boolean {
  const mime = guessMimeType(filename, mimeType);
  return mime.startsWith('image/') || mime === 'application/pdf';
}
