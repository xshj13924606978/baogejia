import OpenAI from 'openai';

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

export async function generateImage(prompt: string): Promise<string> {
  try {
    const client = createImageClient();
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    if (!response.data || response.data.length === 0 || !response.data[0].url) {
      throw new Error('Failed to generate image: no URL returned');
    }

    return response.data[0].url;
  } catch (error) {
    console.error('Image generation error:', error);
    throw error;
  }
}
