import { supabase } from './supabase-client';
import { uploadToBucket } from './supabase-storage-upload';

const BUCKET_NAME = process.env.STORAGE_BUCKET || 'quote-files';

// 防止路径穿越：移除 .. 和绝对路径
function sanitizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment !== '..' && segment !== '.' && segment !== '')
    .join('/');
}

// 上传文件
export async function uploadFile(file: File, path?: string) {
  try {
    const rawPath = path || `${Date.now()}-${file.name}`;
    const filePath = sanitizePath(rawPath);

    const { path: uploadPath, error } = await uploadToBucket(supabase, BUCKET_NAME, filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw new Error(error);

    // 获取公共 URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(uploadPath!);

    return {
      success: true,
      path: uploadPath!,
      url: publicUrl,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

// 获取文件列表
export async function listFiles(prefix?: string) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(prefix || '', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) throw error;

    return {
      success: true,
      files: data,
    };
  } catch (error) {
    console.error('List files error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
    };
  }
}

// 删除文件
export async function deleteFile(path: string) {
  try {
    const safePath = sanitizePath(path);
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([safePath]);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Delete error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

// 下载文件
export function getFileUrl(path: string) {
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

  return publicUrl;
}
