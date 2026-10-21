/**
 * 文件上传处理器 - 持久化存储集成
 *
 * 功能：
 * 1. 文件上传到对象存储
 * 2. 保存上传记录到 user_uploads 表
 * 3. 向量化内容并保存到 knowledge_entries 表
 * 4. 提取产品价格并更新 products 表
 */

import { EmbeddingClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { PriceMatcher } from './price-matching';
import { uploadToBucket } from './supabase-storage-upload';

export interface UploadResult {
  success: boolean;
  uploadId?: string;
  fileKey?: string;
  fileUrl?: string;
  embeddingId?: string;
  productsUpdated?: number;
  error?: string;
}

export interface UploadOptions {
  userId: string;
  conversationId?: string;
  enableKnowledgeBase?: boolean;
  enablePriceExtraction?: boolean;
}

/**
 * 文件上传处理器
 */
export class FileUploadProcessor {
  private supabase = getSupabaseClient();

  constructor() {}

  /**
   * 处理文件上传的完整流程
   */
  async processUpload(
    file: File,
    fileContent: string,
    options: UploadOptions
  ): Promise<UploadResult> {

    try {
      // 步骤1: 上传文件到对象存储
      const uploadResult = await this.uploadToStorage(file, options.userId);
      if (!uploadResult.success) {
        return uploadResult;
      }

      // 步骤2: 保存上传记录到数据库
      const record = await this.saveUploadRecord({
        userId: options.userId,
        conversationId: options.conversationId,
        fileName: file.name,
        fileKey: uploadResult.fileKey!,
        fileUrl: uploadResult.fileUrl!,
        fileSize: file.size,
        fileType: file.type,
      });

      if (!record) {
        return { success: false, error: '保存上传记录失败' };
      }


      // 步骤3: 向量化内容并保存到知识库（如果启用）
      let embeddingId: string | undefined;
      if (options.enableKnowledgeBase && fileContent) {
        const embeddingResult = await this.processKnowledgeBase(
          record.id,
          file.name,
          fileContent,
          options.userId
        );
        embeddingId = embeddingResult.embeddingId;
      }

      // 步骤4: 提取产品价格并更新数据库（如果启用）
      let productsUpdated = 0;
      if (options.enablePriceExtraction && fileContent) {
        const priceResult = await this.processPriceExtraction(fileContent, options.userId);
        productsUpdated = priceResult.productsUpdated;
      }


      return {
        success: true,
        uploadId: record.id,
        fileKey: uploadResult.fileKey,
        fileUrl: uploadResult.fileUrl,
        embeddingId,
        productsUpdated,
      };
    } catch (error) {
      console.error('[FileUploadProcessor] 处理文件上传失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 上传文件到对象存储
   */
  private async uploadToStorage(file: File, userId: string): Promise<UploadResult> {

    try {
      // 读取文件内容
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // 生成安全的文件名
      const timestamp = Date.now();
      const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const fileKey = `uploads/${userId}/${safeName}`;


      // 上传到 Supabase Storage（与 /api/upload 保持一致；≤50MB 单请求 / >50MB TUS 可恢复上传）
      const { path: uploadPath, error: uploadError } = await uploadToBucket(
        this.supabase,
        'quote-files',
        fileKey,
        buffer,
        { contentType: file.type, upsert: false }
      );

      if (uploadError) {
        throw new Error(uploadError);
      }

      // 生成公开 URL
      const { data: urlData } = this.supabase.storage
        .from('quote-files')
        .getPublicUrl(uploadPath!);

      return {
        success: true,
        fileKey: uploadPath!,
        fileUrl: urlData.publicUrl,
      };
    } catch (error) {
      console.error('[FileUploadProcessor] 上传到对象存储失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传到对象存储失败',
      };
    }
  }

  /**
   * 保存上传记录到数据库
   */
  private async saveUploadRecord(data: {
    userId: string;
    conversationId?: string;
    fileName: string;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    fileType: string;
  }) {

    const supabase = getSupabaseClient();

    // 构建插入数据 - 使用正确的字段名
    const insertData: any = {
      user_id: data.userId,
      file_name: data.fileName,
      file_key: data.fileKey,
      public_url: data.fileUrl,  // 注意：数据库字段是 public_url，不是 file_url
      file_size: data.fileSize,
      file_type: data.fileType,
      status: 'uploaded',
    };

    // 如果有 conversationId，保存在 metadata 中（因为数据库表中没有 conversation_id 字段）
    if (data.conversationId) {
      insertData.metadata = {
        conversation_id: data.conversationId,
      };
    }

    const { data: record, error } = await supabase
      .from('user_uploads')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[FileUploadProcessor] 保存上传记录失败:', error);
      return null;
    }

    return record;
  }

  /**
   * 处理知识库向量化
   */
  private async processKnowledgeBase(
    uploadId: string,
    fileName: string,
    content: string,
    userId: string
  ): Promise<{ embeddingId?: string; error?: string }> {

    try {
      // 创建 embedding 客户端（不传递 headers，因为在后台处理）
      const client = new EmbeddingClient();

      // 生成文本向量
      const embedding = await client.embedText(content);


      // 保存到 knowledge_entries 表
      const supabase = getSupabaseClient();

      const { data: record, error } = await supabase
        .from('knowledge_entries')
        .insert({
          user_id: userId,
          type: 'document',
          title: fileName,
          description: `文件上传 ID: ${uploadId}`,
          file_name: fileName,
          file_url: '',
          content: content,
          embedding: embedding,
          status: 'active',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[FileUploadProcessor] 保存知识库记录失败:', error);
        return { error: '保存知识库记录失败' };
      }


      return { embeddingId: record.id };
    } catch (error) {
      console.error('[FileUploadProcessor] 向量化失败:', error);
      return { error: error instanceof Error ? error.message : '向量化失败' };
    }
  }

  /**
   * 处理产品价格提取
   */
  private async processPriceExtraction(
    content: string,
    userId: string
  ): Promise<{ productsUpdated: number; error?: string }> {

    try {
      // 从内容中提取产品列表（简化版，实际可能需要更复杂的解析）
      const products: { name: string; model?: string }[] = [];

      // 简单的正则表达式提取产品名称和型号
      // 格式：产品名称 型号 或 产品名称 (型号)
      const productPatterns = [
        /([^\d\n]{2,30})\s+([A-Za-z0-9][-_A-Za-z0-9]{2,20})/g, // 名称 + 型号
        /([^\d\n]{2,30})\s*\(([A-Za-z0-9][-_A-Za-z0-9]{2,20})\)/g, // 名称 (型号)
      ];

      for (const pattern of productPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1].trim();
          const model = match[2].trim();

          // 避免重复
          if (!products.some((p) => p.name === name && p.model === model)) {
            products.push({ name, model });
          }
        }
      }


      if (products.length === 0) {
        return { productsUpdated: 0 };
      }

      // 使用 PriceMatcher 批量匹配价格
      const priceResults = await PriceMatcher.matchPrices(products, userId);


      // 统计成功匹配的产品数量
      const productsUpdated = priceResults.filter((r) => r.confidence >= 50).length;

      return { productsUpdated };
    } catch (error) {
      console.error('[FileUploadProcessor] 价格提取失败:', error);
      return {
        productsUpdated: 0,
        error: error instanceof Error ? error.message : '价格提取失败',
      };
    }
  }
}

/**
 * 导出单例实例
 */
export const fileUploadProcessor = new FileUploadProcessor();
