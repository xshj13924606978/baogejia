/**
 * Supabase Storage 大文件上传封装（#20260823-1900）
 *
 * Supabase Storage 单请求 PUT 上传（.upload()）存在硬性上限 50MB，
 * 超出会返回 413 "The object exceeded the maximum allowed size"（与 bucket.file_size_limit 无关）。
 * 超过 50MB 的对象必须使用 TUS 可恢复上传（createSignedUploadUrl + uploadToSignedUrl，上限 5GB）。
 * 本封装按文件大小自动分流，调用方无需感知差异。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

/** Supabase 单请求上传上限（超过需走 TUS 可恢复上传） */
export const SINGLE_UPLOAD_LIMIT = 50 * 1024 * 1024;

export interface StorageUploadOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export interface StorageUploadResult {
  path?: string;
  error?: string;
}

/** 提取数据源：浏览器端用 Blob，Node 端用 Buffer（tus-js-client Node 版不接受 Blob） */
function toSource(data: ArrayBuffer | Buffer | Blob): Blob | Buffer {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data as ArrayBuffer);
}

/**
 * 上传文件到指定 bucket，自动按大小分流：
 * - ≤50MB：storage.upload()（单请求 PUT）
 * - >50MB：tus-js-client 直连 Supabase TUS 端点（可恢复上传，上限 50GB）
 *
 * 注意：>50MB 的上传同时受 Supabase 托管项目「Global file size limit」
 * （Dashboard → Storage → Settings）约束，需将其调至 ≥512MB 才能上传大文件。
 */
export async function uploadToBucket(
  client: SupabaseClient,
  bucket: string,
  filePath: string,
  data: ArrayBuffer | Buffer | Blob,
  opts: StorageUploadOptions = {}
): Promise<StorageUploadResult> {
  const contentType = opts.contentType || 'application/octet-stream';
  const upsert = opts.upsert ?? false;
  const cacheControl = opts.cacheControl ?? '3600';

  const size = data instanceof Blob ? data.size : Buffer.byteLength(data as Buffer | ArrayBuffer);
  const source = toSource(data);

  if (size <= SINGLE_UPLOAD_LIMIT) {
    const { data: d, error } = await client.storage
      .from(bucket)
      .upload(filePath, source, { contentType, cacheControl, upsert });
    if (error) return { error: error.message };
    return { path: (d as { path?: string } | null)?.path ?? filePath };
  }

  // >50MB：TUS 可恢复上传
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { error: 'TUS 上传需要 SUPABASE_SERVICE_ROLE_KEY 环境变量' };
  }
  const projectId = new URL(supabaseUrl).hostname.split('.')[0];
  const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

  try {
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(source as any, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'x-upsert': upsert ? 'true' : 'false',
        },
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: bucket,
          objectName: filePath,
          contentType,
          cacheControl,
        },
        onError: (e) => reject(new Error(e.message || String(e))),
        onSuccess: () => resolve(),
      });
      upload.start();
    });
    return { path: filePath };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'TUS 上传失败' };
  }
}
