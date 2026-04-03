import OpenAI from 'openai';

// 生图客户端（通过 LaoZhang.ai 中转）
const client = new OpenAI({
  apiKey: process.env.LAOZHANG_API_KEY,
  baseURL: process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1',
  dangerouslyAllowBrowser: false,
});

const DEFAULT_MODEL = process.env.IMAGE_GENERATION_MODEL || 'gemini-2.5-flash-image';

export interface GenerateImageOptions {
  prompt: string;
  size?: '1024x1024' | '2048x2048';
  model?: string;
}

export interface GenerateImageResult {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
  model: string;
}

/**
 * 生成图片
 */
export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const model = options.model || DEFAULT_MODEL;

  console.log(`[ImageGen] 生成图片: model=${model}, prompt="${options.prompt.substring(0, 50)}..."`);

  const response = await client.images.generate({
    model,
    prompt: options.prompt,
    n: 1,
    size: options.size || '1024x1024',
    response_format: 'b64_json',
  });

  const imageData = response.data[0];
  if (!imageData) {
    throw new Error('未生成图片数据');
  }

  console.log('[ImageGen] 图片生成成功');

  return {
    b64Json: imageData.b64_json,
    url: imageData.url,
    revisedPrompt: (imageData as any).revised_prompt,
    model,
  };
}
