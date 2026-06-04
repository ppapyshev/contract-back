import fs from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { DocumentFile } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export type StorageMode = 'database' | 'local' | 's3';

export type StoredFile = {
  key: string;
  localPath?: string;
  publicUrl: string;
  filename: string;
  mimeType: string;
  size: number;
};

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export function isObjectStorageEnabled(): boolean {
  return Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

export function getStorageMode(): StorageMode {
  if (env.STORAGE_MODE === 's3' || (env.STORAGE_MODE !== 'local' && isObjectStorageEnabled())) {
    return 's3';
  }
  if (env.STORAGE_MODE === 'local') {
    return 'local';
  }
  return 'database';
}

export function getFilePublicUrl(fileId: string): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/files/${fileId}/content`;
}

export function resolveFilePublicUrl(storedPath: string): string {
  if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
    return storedPath;
  }

  if (storedPath.startsWith('db:')) {
    return getFilePublicUrl(storedPath.slice(3));
  }

  if (storedPath.startsWith('uploads/')) {
    const base = env.S3_PUBLIC_URL?.replace(/\/$/, '') ?? env.PUBLIC_URL.replace(/\/$/, '');
    return `${base}/${storedPath}`;
  }

  const fileName = path.basename(storedPath);
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/uploads/${fileName}`;
}

async function storeToS3(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
  const ext = path.extname(originalName) || '.bin';
  const key = `uploads/${uuidv4()}${ext}`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const base = env.S3_PUBLIC_URL?.replace(/\/$/, '') ?? env.PUBLIC_URL;
  return {
    key,
    publicUrl: `${base}/${key}`,
    filename: originalName,
    mimeType,
    size: buffer.length,
  };
}

async function storeToLocal(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
  const ext = path.extname(originalName) || '.bin';
  const storedName = `${uuidv4()}${ext}`;
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  const localPath = path.join(env.UPLOAD_DIR, storedName);
  await fs.writeFile(localPath, buffer);

  return {
    key: storedName,
    localPath,
    publicUrl: `${env.PUBLIC_URL.replace(/\/$/, '')}/uploads/${storedName}`,
    filename: originalName,
    mimeType,
    size: buffer.length,
  };
}

/** @deprecated use saveDocumentFile */
export async function storeFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredFile> {
  const mode = getStorageMode();
  if (mode === 's3') {
    return storeToS3(buffer, originalName, mimeType);
  }
  return storeToLocal(buffer, originalName, mimeType);
}

export async function saveDocumentFile(
  userId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ file: DocumentFile; publicUrl: string }> {
  const mode = getStorageMode();

  if (mode === 'database') {
    const file = await prisma.documentFile.create({
      data: {
        userId,
        filename: originalName,
        mimeType,
        size: buffer.length,
        path: 'db',
        data: buffer,
      },
    });

    const pathValue = `db:${file.id}`;
    const updated = await prisma.documentFile.update({
      where: { id: file.id },
      data: { path: pathValue },
    });

    return { file: updated, publicUrl: getFilePublicUrl(file.id) };
  }

  if (mode === 's3') {
    const stored = await storeToS3(buffer, originalName, mimeType);
    const file = await prisma.documentFile.create({
      data: {
        userId,
        filename: originalName,
        mimeType,
        size: buffer.length,
        path: stored.key,
      },
    });
    return { file, publicUrl: stored.publicUrl };
  }

  const stored = await storeToLocal(buffer, originalName, mimeType);
  const file = await prisma.documentFile.create({
    data: {
      userId,
      filename: originalName,
      mimeType,
      size: buffer.length,
      path: stored.localPath!,
    },
  });
  return { file, publicUrl: stored.publicUrl };
}

export async function readDocumentFileContent(
  fileId: string,
  userId?: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const file = await prisma.documentFile.findFirst({
    where: userId ? { id: fileId, userId } : { id: fileId },
  });

  if (!file) {
    return null;
  }

  if (file.data) {
    return {
      buffer: Buffer.from(file.data),
      mimeType: file.mimeType,
      filename: file.filename,
    };
  }

  if (file.path.startsWith('uploads/') && isObjectStorageEnabled()) {
    return null;
  }

  try {
    const buffer = await fs.readFile(file.path);
    return { buffer, mimeType: file.mimeType, filename: file.filename };
  } catch {
    return null;
  }
}
