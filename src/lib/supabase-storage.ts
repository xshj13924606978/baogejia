import { supabase } from './supabase-client';

const BUCKET_NAME = process.env.STORAGE_BUCKET || 'quote-files';

// 上传文件
export async function uploadFile(file: File, path?: string) {
  try {
    const filePath = path || `${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    // 获取公共 URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return {
      success: true,
      path: data.path,
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
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

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
