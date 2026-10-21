import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadToBucket } from '@/lib/supabase-storage-upload';
import { parseKnowledgeFile } from '@/lib/knowledge/parsers';
import type { ParseResult } from '@/lib/knowledge/parsers';
import { logUserAction } from '@/lib/user-log-service';

/**
 * 知识库统一上传处理器（指令 2/3 阶段 A）
 *
 * 编排链路：参数校验 → 安全 fileKey → 存储上传（≤50MB 单请求 / >50MB TUS）→
 * 文件解析（优雅降级，不影响上传）→ 建记录 → 标签关联 → 用户日志。
 *
 * 与框架解耦：不依赖 NextRequest/NextResponse，路由层负责认证与 HTTP 映射，
 * 其他入口（如网盘/网页链接导入、批量导入）可直接复用。
 */

/** 知识库类型枚举 */
export const KNOWLEDGE_TYPES = {
  PRICE: 'price', // 产品价格库
  DOCUMENT: 'document', // 技术文档库
  CASE: 'case', // 案例库
  STANDARD: 'standard', // 标准规范库
  DRAWING: 'drawing', // 图纸图片库
  QUOTA: 'quota', // 定额库
  OTHER: 'other', // 其他
} as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[keyof typeof KNOWLEDGE_TYPES];

/** 允许的文件类型（MIME → 扩展名） */
export const ALLOWED_MIME_TYPES = {
  // 文档
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel.sheet.macroEnabled.12': 'xlsm',
  'text/plain': 'txt',
  'text/csv': 'csv',

  // 图片
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',

  // CAD 图纸（.dwg/.dxf，解析器已支持；浏览器 MIME 各不一致，扩展名兜底）
  'application/acad': 'dwg',
  'application/x-acad': 'dwg',
  'application/x-dwg': 'dwg',
  'image/vnd.dwg': 'dwg',
  'application/dxf': 'dxf',
  'application/x-dxf': 'dxf',
  'image/vnd.dxf': 'dxf',

  // 压缩包
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
} as const;

/** 文件大小限制（500MB，#20260823-1900 由 50MB 调大） */
export const MAX_FILE_SIZE = 500 * 1024 * 1024;

/** 知识库存储 bucket */
export const KNOWLEDGE_BUCKET = 'knowledge-base';

/** 上传参数校验错误（路由层据此映射 HTTP 状态码） */
export class UploadError extends Error {
  readonly status: number;
  /** 附加错误详情（如存储/数据库原始错误） */
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
    this.details = details;
  }
}

export interface UploadFileInput {
  name: string;
  type: string;
  buffer: Buffer;
}

export interface UploadProcessorOptions {
  userId: string;
  type: string;
  title: string;
  description?: string;
  file: UploadFileInput;
  metadata?: Record<string, any>;
  tags?: string[];
  bucket?: string;
  maxFileSize?: number;
  /** 记录初始状态：默认 pending（待审核）；管理员上传可传 approved 直接上架 */
  status?: 'pending' | 'approved';
  requestMeta?: { ipAddress?: string | null; userAgent?: string | null };
}

export interface UploadProcessorResult {
  /** 新建的知识条目（DB 行） */
  record: Record<string, any>;
  /** 解析摘要（页数/字数/识别状态等，供前端展示） */
  parse: ParseResult['metadata'];
  /** 存储 fileKey（清理用） */
  fileKey: string;
}

/** 校验文件是否在允许列表内（MIME 或扩展名兜底） */
export function isAllowedFileType(name: string, mime: string): boolean {
  const ext = (ALLOWED_MIME_TYPES as Record<string, string>)[mime];
  if (ext) return true;
  return /\.(pdf|doc|docx|xls|xlsx|xlsm|txt|csv|jpg|jpeg|png|gif|webp|bmp|dwg|dxf|zip|rar)$/i.test(
    name
  );
}

export async function processKnowledgeUpload(
  supabase: SupabaseClient,
  opts: UploadProcessorOptions
): Promise<UploadProcessorResult> {
  const { userId, type, title } = opts;
  const description = opts.description ?? '';
  const file = opts.file;
  const metadata = opts.metadata ?? {};
  const tagNames = opts.tags ?? [];
  const bucket = opts.bucket ?? KNOWLEDGE_BUCKET;
  const maxFileSize = opts.maxFileSize ?? MAX_FILE_SIZE;

  // ---- 1. 参数校验 ----
  if (!file || !file.name) throw new UploadError('请上传文件');
  if (!type) throw new UploadError('请选择知识库类型');
  if (!title) throw new UploadError('请输入标题');
  if (!(Object.values(KNOWLEDGE_TYPES) as string[]).includes(type)) {
    throw new UploadError('无效的知识库类型');
  }
  if (file.buffer.length > maxFileSize) {
    throw new UploadError('文件大小不能超过500MB');
  }
  if (!isAllowedFileType(file.name, file.type)) {
    throw new UploadError('不支持的文件类型');
  }

  // ---- 2. 生成安全 fileKey ----
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const fileKey = `knowledge/${type}/${userId}/${safeName}`;

  // ---- 3. 上传到存储（≤50MB 单请求 / >50MB TUS 可恢复上传）----
  const { error: uploadError } = await uploadToBucket(supabase, bucket, fileKey, file.buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error('[Knowledge Upload] 上传到存储失败:', uploadError);
    throw new UploadError('上传到存储失败', 500, uploadError);
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileKey);

  // ---- 4. 文件解析（指令 2/3）：失败优雅降级，不影响上传 ----
  let parsed: ParseResult = { ok: false, text: '', metadata: { format: 'unknown' } };
  try {
    parsed = await parseKnowledgeFile(file.buffer, file.name, file.type);
  } catch (parseErr: any) {
    console.warn('[Knowledge Upload] 文件解析异常（已降级）:', parseErr?.message);
  }

  // 解析信息合并进 metadata（用户自定义字段 + parse 结果）
  const finalMetadata = { ...metadata, parse: parsed.metadata };

  // ---- 5. 保存记录到数据库 ----
  const { data: record, error: dbError } = await supabase
    .from('knowledge_entries')
    .insert({
      user_id: userId,
      type,
      title,
      description,
      file_name: file.name,
      file_key: fileKey,
      file_url: urlData.publicUrl,
      file_size: file.buffer.length,
      file_type: file.type,
      status: opts.status ?? 'pending', // 默认需要审核；管理员上传直接 approved
      metadata: finalMetadata,
      content_text: parsed.text || null, // search_tsv 由触发器自动维护
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbError) {
    console.error('[Knowledge Upload] 保存记录失败:', dbError);
    // 数据库保存失败时回滚已上传的文件
    await supabase.storage.from(bucket).remove([fileKey]).catch(() => {});
    throw new UploadError('保存记录失败', 500, dbError.message);
  }

  // ---- 6. 处理 tags：批量查询/创建/关联 ----
  if (tagNames.length > 0) {
    try {
      const { data: existingTags } = await supabase
        .from('knowledge_tags')
        .select('id, name')
        .in('name', tagNames);

      const existingMap = new Map(
        (existingTags || []).map((t: any) => [t.name, t.id] as [string, string])
      );

      const toCreate = tagNames.filter((name) => !existingMap.has(name));

      let newTagIds: string[] = [];
      if (toCreate.length > 0) {
        const { data: createdTags } = await supabase
          .from('knowledge_tags')
          .insert(toCreate.map((name) => ({ name })))
          .select('id');
        newTagIds = (createdTags || []).map((t: any) => t.id);
      }

      const allTagIds = tagNames
        .map((name) => existingMap.get(name))
        .filter((id): id is string => !!id)
        .concat(newTagIds);

      if (allTagIds.length > 0) {
        await supabase
          .from('knowledge_entry_tags')
          .insert(allTagIds.map((tagId) => ({ entry_id: record.id, tag_id: tagId })));
      }
    } catch (tagErr: any) {
      console.warn('[Knowledge Upload] 标签处理失败（已忽略）:', tagErr.message);
    }
  }

  // ---- 7. 记录上传日志（失败静默，不影响主流程）----
  await logUserAction({
    userId,
    actionType: 'upload',
    actionDetails: {
      entry_id: record.id,
      file_name: file.name,
      file_size: file.buffer.length,
      type,
    },
    ipAddress: opts.requestMeta?.ipAddress ?? null,
    userAgent: opts.requestMeta?.userAgent ?? null,
  }).catch((e: any) => console.warn('[Knowledge Upload] 日志写入失败（已忽略）:', e?.message));

  return { record, parse: parsed.metadata, fileKey };
}
