/**
 * 知识库文件解析器公共类型
 */

/** 解析出的文件元数据（存入 knowledge_entries.metadata.parse） */
export interface ParsedMetadata {
  /** 识别出的格式：pdf / word / excel / image / cad / text / unknown */
  format: string;
  /** PDF 页数 */
  pages?: number;
  /** 文本字符数（含 OCR） */
  characters?: number;
  /** 图片宽（px） */
  width?: number;
  /** 图片高（px） */
  height?: number;
  /** Excel sheet 数 */
  sheets?: number;
  /** Excel 总行数（近似） */
  rows?: number;
  /** Excel 总列数（最大） */
  cols?: number;
  /** CAD 文本实体数 */
  entities?: number;
  /** 文本预览（前 200 字） */
  textPreview?: string;
  /** 图片 OCR 识别文本（可选，失败为空） */
  ocrText?: string;
  /** 是否走兜底路径（如 PDF 原始流提取） */
  fallback?: boolean;
  /** 解析失败原因 */
  error?: string;
}

/** 解析结果 */
export interface ParseResult {
  /** 是否成功（失败不阻塞上传） */
  ok: boolean;
  /** 全文文本（写入 content_text） */
  text: string;
  /** 解析元数据 */
  metadata: ParsedMetadata;
}

/** 解析进度回调（供前端展示"解析中"状态） */
export type ParseProgressCallback = (stage: string, percent: number) => void;
