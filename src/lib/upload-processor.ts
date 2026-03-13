/**
 * 文件上传处理器 - 持久化存储集成
 *
 * 功能：
 * 1. 文件上传到对象存储
 * 2. 保存上传记录到 user_uploads 表
 * 3. 向量化内容并保存到 knowledge_entries 表
 * 4. 提取产品价格并更新 products 表
 */

import { S3Storage } from 'coze-coding-dev-sdk';
import { EmbeddingClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { PriceMatcher } from './price-matching';

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
  private storage: S3Storage;

  constructor() {
    this.storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }

  /**
   * 处理文件上传的完整流程
   */
  async processUpload(
    file: File,
    fileContent: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    console.log('[FileUploadProcessor] ========== 开始处理文件上传 ==========');
    console.log('[FileUploadProcessor] 文件信息:', {
      name: file.name,
      size: file.size,
      type: file.type,
      userId: options.userId,
    });

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

      console.log('[FileUploadProcessor] 上传记录已保存，ID:', record.id);

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

      console.log('[FileUploadProcessor] ========== 文件上传处理完成 ==========');

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
    console.log('[FileUploadProcessor] 开始上传到对象存储...');

    try {
      // 读取文件内容
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // 生成安全的文件名
      const timestamp = Date.now();
      const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const fileKey = `uploads/${userId}/${safeName}`;

      console.log('[FileUploadProcessor] 文件路径:', fileKey);

      // 上传到对象存储
      const actualKey = await this.storage.uploadFile({
        fileContent: buffer,
        fileName: fileKey,
        contentType: file.type,
      });

      console.log('[FileUploadProcessor] 对象存储上传成功，Key:', actualKey);

      // 生成签名 URL
      const fileUrl = await this.storage.generatePresignedUrl({
        key: actualKey,
        expireTime: 86400, // 1 天
      });

      console.log('[FileUploadProcessor] 签名 URL 已生成');

      return {
        success: true,
        fileKey: actualKey,
        fileUrl,
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
    console.log('[FileUploadProcessor] 保存上传记录到数据库...');

    const supabase = getSupabaseClient();

    const { data: record, error } = await supabase
      .from('user_uploads')
      .insert({
        user_id: data.userId,
        conversation_id: data.conversationId,
        file_name: data.fileName,
        file_key: data.fileKey,
        file_url: data.fileUrl,
        file_size: data.fileSize,
        file_type: data.fileType,
        status: 'uploaded',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[FileUploadProcessor] 保存上传记录失败:', error);
      return null;
    }

    console.log('[FileUploadProcessor] 上传记录已保存');
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
    console.log('[FileUploadProcessor] 开始向量化内容...');

    try {
      // 创建 embedding 客户端（不传递 headers，因为在后台处理）
      const client = new EmbeddingClient();

      // 生成文本向量
      const embedding = await client.embedText(content);

      console.log('[FileUploadProcessor] 向量化完成，向量维度:', embedding.length);

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

      console.log('[FileUploadProcessor] 知识库记录已保存，ID:', record.id);

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
    console.log('[FileUploadProcessor] 开始提取产品价格...');

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

      console.log('[FileUploadProcessor] 从内容中提取到', products.length, '个产品');

      if (products.length === 0) {
        console.log('[FileUploadProcessor] 未提取到产品信息');
        return { productsUpdated: 0 };
      }

      // 使用 PriceMatcher 批量匹配价格
      const priceResults = await PriceMatcher.matchPrices(products, userId);

      console.log('[FileUploadProcessor] 价格匹配完成，结果:', priceResults.length);

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
