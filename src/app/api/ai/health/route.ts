import { NextResponse } from 'next/server';
import { isGemmaAvailable } from '@/lib/gemma-local-client';

export async function GET() {
  const gemmaAvailable = await isGemmaAvailable();

  return NextResponse.json({
    gemma: {
      available: gemmaAvailable,
      model: process.env.GEMMA_MODEL,
      enabled: process.env.GEMMA_ENABLED === 'true',
      apiUrl: process.env.GEMMA_API_URL,
    },
    deepseek: {
      available: !!process.env.DEEPSEEK_API_KEY,
    },
    gemini: {
      available: !!process.env.LAOZHANG_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
