import OpenAI from 'openai';

/**
 * 创建 OpenAI 客户端实例（延迟初始化）
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
 * 生成图片返回结果
 */
export interface GenerateImageResult {
  url: string;
  b64Json?: string;
  revisedPrompt?: string;
  model?: string;
}

/**
 * 生成图片
 * @param prompt 图片描述提示词
 * @returns 生成图片结果
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  try {
    const client = createImageClient();
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    const data = response.data[0];
    if (!data) {
      throw new Error('生成图片失败：未返回数据');
    }

    return {
      url: data.url || '',
      b64Json: data.b64_json,
      revisedPrompt: data.revised_prompt,
      model: response.model,
    };
  } catch (error) {
    console.error('生成图片失败:', error);
    throw error;
  }
}
