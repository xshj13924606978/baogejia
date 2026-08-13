import OpenAI from 'openai';

/**
 * 创建 OpenAI 客户端实例（延迟初始化）
 * 仅在调用时才会创建，避免构建阶段因环境变量缺失而报错
 */
function createImageClient(): OpenAI {
  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) {
    throw new Error('LAOZHANG_API_KEY 未配置，生图功能不可用');
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1',
    dangerouslyAllowBrowser: false,
  });
}

/**
 * 生成图片
 * @param prompt 图片描述提示词
 * @returns 生成图片的URL
 */
export async function generateImage(prompt: string): Promise<string> {
  try {
    const client = createImageClient();
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });
    return response.data[0]?.url || '';
  } catch (error) {
    console.error('生成图片失败:', error);
    throw error;
  }
}
