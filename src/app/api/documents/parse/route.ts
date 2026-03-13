import { NextResponse } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

export async function POST(req: Request) {
  try {
    const { fileUrl, fileName, fileType } = await req.json();

    console.log(`[Parse] 开始解析文件: ${fileName} 类型: ${fileType}`);

    // 下载文件内容
    console.log(`[Parse] 下载文件: ${fileUrl}`);
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`文件下载失败: ${fileResponse.status}`);
    }
    const fileBuffer = await fileResponse.arrayBuffer();
    console.log(`[Parse] 文件下载成功，大小: ${fileBuffer.byteLength} bytes`);

    let result = null;
    let parseMethod = '';
    let parseError = null;

    // 方案一：优先使用TextIn解析
    try {
      console.log('[Parse] 尝试使用TextIn解析...');
      result = await parseWithTextIn(fileBuffer, fileName, fileType);
      parseMethod = 'TextIn';
      console.log('[Parse] TextIn解析成功，产品数量:', result.products.length);
    } catch (textInError) {
      console.log(
        '[Parse] TextIn解析失败:',
        textInError instanceof Error ? textInError.message : String(textInError)
      );
      parseError = textInError;

      // 方案二：TextIn失败时使用Coze Vision
      try {
        console.log('[Parse] 切换到Coze Vision解析...');
        result = await parseWithCozeVision(fileBuffer, fileName, fileType, fileUrl);
        parseMethod = 'Coze Vision';
        console.log('[Parse] Coze Vision解析成功，产品数量:', result.products.length);
      } catch (cozeError) {
        console.error(
          '[Parse] Coze Vision解析失败:',
          cozeError instanceof Error ? cozeError.message : String(cozeError)
        );
        throw new Error(
          `所有解析方案均失败: ${textInError instanceof Error ? textInError.message : String(textInError)}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      products: result.products || [],
      remarks: result.remarks || [],
      rawContent: result.rawContent,
      parseMethod, // 返回使用的解析方式，便于调试
    });
  } catch (error) {
    console.error('[Parse] 解析失败:', error);
    return NextResponse.json({
      error: '解析失败',
      products: [],
      remarks: [`解析失败: ${error instanceof Error ? error.message : '未知错误'}`],
    });
  }
}

// TextIn解析（主方案）
async function parseWithTextIn(fileBuffer: ArrayBuffer, fileName: string, fileType: string) {
  const appId = process.env.TEXTIN_APP_ID;
  const secretCode = process.env.TEXTIN_SECRET_CODE;

  if (!appId || !secretCode) {
    throw new Error('TextIn未配置');
  }

  // 根据文件类型选择API
  let apiUrl = 'https://api.textin.com/ai/service/v1/pdf_to_markdown';
  let isImageOcr = false;

  if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|bmp|gif|tiff|webp)$/i)) {
    apiUrl = 'https://api.textin.com/ai/service/v1/recognize/text';
    isImageOcr = true;
    console.log(`[TextIn] 检测到图片文件，使用OCR接口: ${apiUrl}`);
  } else if (fileType.includes('pdf') || fileName.match(/\.pdf$/i)) {
    apiUrl = 'https://api.textin.com/ai/service/v1/pdf_to_markdown';
    console.log(`[TextIn] 检测到PDF文件，使用PDF转Markdown接口: ${apiUrl}`);
  } else if (fileName.match(/\.(doc|docx)$/i)) {
    apiUrl = 'https://api.textin.com/ai/service/v1/word_to_markdown';
    console.log(`[TextIn] 检测到Word文档，使用Word转Markdown接口: ${apiUrl}`);
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'x-ti-app-id': appId,
      'x-ti-secret-code': secretCode,
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  });

  const textInResult = await response.json();
  console.log(`[TextIn] API响应状态: ${response.status}`);
  console.log(`[TextIn] API响应预览:`, JSON.stringify(textInResult).substring(0, 300));

  // 检查是否是"机器人不存在"错误
  const isRobotError =
    textInResult.code === 40007 ||
    textInResult.message?.includes('机器人不存在') ||
    textInResult.msg?.includes('机器人不存在');

  if (isRobotError && isImageOcr) {
    console.log('[TextIn] 图片OCR接口返回"机器人不存在"错误');
    throw new Error('TextIn OCR接口不可用');
  }

  // 检查其他错误
  if (textInResult.code && textInResult.code !== 200 && textInResult.code !== 0) {
    throw new Error(`TextIn API错误: ${textInResult.message || textInResult.msg}`);
  }

  // 提取文本内容
  let markdown = '';
  if (textInResult.result?.markdown) {
    markdown = textInResult.result.markdown;
  } else if (textInResult.result?.text) {
    markdown = textInResult.result.text;
  } else if (textInResult.result?.content) {
    markdown = textInResult.result.content;
  } else if (textInResult.data?.markdown) {
    markdown = textInResult.data.markdown;
  } else if (textInResult.data?.text) {
    markdown = textInResult.data.text;
  } else if (textInResult.markdown) {
    markdown = textInResult.markdown;
  } else if (textInResult.text) {
    markdown = textInResult.text;
  } else if (textInResult.content) {
    markdown = textInResult.content;
  } else {
    markdown = JSON.stringify(textInResult);
  }

  if (!markdown || markdown.length < 10) {
    throw new Error('TextIn未能提取到有效内容');
  }

  console.log(`[TextIn] 解析成功，内容长度: ${markdown.length}`);

  // 用大模型提取产品
  const products = await extractProductsFromMarkdown(markdown, fileName);

  return {
    products,
    remarks: products.length === 0 ? ['未从文件中提取到产品信息'] : [],
    rawContent: markdown.substring(0, 5000),
  };
}

// Coze Vision解析（备用方案）
async function parseWithCozeVision(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  fileUrl: string
) {
  const visionConfig = new Config();
  const visionClient = new LLMClient(visionConfig);

  console.log(`[Coze Vision] 开始使用Vision模型解析图片...`);

  // 将Buffer转换为base64
  const base64Data = Buffer.from(fileBuffer).toString('base64');
  const mimeType = fileType || 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  const visionMessages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: `请详细分析这张图片，并提取所有产品信息。

要求：
1. 如果图片中包含表格，请完整提取表格的所有内容，特别是：
   - 产品名称（第一列）
   - 型号/规格
   - 品牌
   - 参数描述
   - 单位
   - 数量
   - 单价、总价（如果有）

2. 如果图片是询价单，请列出所有产品的详细信息

3. 请用Markdown表格格式返回提取的表格内容，格式如下：
| 产品名称 | 型号 | 品牌 | 参数描述 | 单位 | 数量 |
|---------|------|------|---------|------|------|
| 产品1   | xxx  | xxx  | xxx     | xxx  | xxx  |
| 产品2   | xxx  | xxx  | xxx     | xxx  | xxx  |

4. 确保包含所有产品行，不要遗漏任何产品`,
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: dataUrl,
            detail: 'high' as const,
          },
        },
      ],
    },
  ];

  try {
    // 使用Vision模型处理图片
    const response = await visionClient.invoke(visionMessages, {
      model: 'doubao-seed-1-6-vision-250815',
      temperature: 0.1,
    });

    console.log(`[Coze Vision] 识别成功，内容长度: ${response.content?.length || 0}`);

    if (!response.content) {
      throw new Error('Coze Vision未能返回内容');
    }

    const extractedText = response.content;
    console.log(`[Coze Vision] 内容预览: ${extractedText.substring(0, 200)}...`);

    // 用大模型提取产品
    const products = await extractProductsFromMarkdown(extractedText, fileName);

    return {
      products,
      remarks: products.length === 0 ? ['未从图片中识别到产品信息'] : [],
      rawContent: extractedText.substring(0, 5000),
    };
  } catch (error) {
    console.error('[Coze Vision] 识别失败:', error);
    throw error;
  }
}

// 从文本中提取产品信息（大模型）
async function extractProductsFromMarkdown(markdown: string, fileName: string) {
  try {
    const contentSample = markdown.substring(0, 6000);

    const prompt = `你是一个专业的产品信息提取助手。请从以下内容中提取所有产品信息。

文件名称: ${fileName}

内容:
${contentSample}

提取规则:
1. 优先识别表格（HTML表格或Markdown表格）
   - HTML表格：<table>...</table>
   - Markdown表格：| 列1 | 列2 | ... |
2. 表格的第一行通常是表头，包含：产品名称、型号、品牌、规格、单位、数量、单价等
3. 如果没有表格，则从文本描述中识别产品信息
4. 每个产品应该包含以下字段（如果有）：
   - name: 产品名称
   - model: 型号/规格型号
   - brand: 品牌
   - specs: 技术参数/规格描述
   - unit: 单位（如：个、台、套）
   - quantity: 数量（数字）
   - price: 单价（数字，不含货币符号）
   - total: 总价（数字）

返回格式必须是严格的JSON（不要包含任何markdown标记或额外文字）:
{
  "products": [
    {
      "name": "产品名称",
      "model": "型号",
      "brand": "品牌",
      "specs": "规格参数",
      "unit": "单位",
      "quantity": 数量,
      "price": 单价,
      "total": 总价
    }
  ]
}

如果没有找到任何产品，返回 {"products": []}`;

    console.log('[LLM提取] 开始调用LLMClient');

    const llmConfig = new Config();
    const llmClient = new LLMClient(llmConfig);

    const response = await llmClient.invoke(
      [
        {
          role: 'system',
          content: '你是一个专业的产品信息提取助手，擅长从HTML表格和Markdown表格中提取产品信息。',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1 }
    );

    console.log(`[LLM提取] LLM响应:`, JSON.stringify(response).substring(0, 300));

    try {
      if (!response || !response.content) {
        console.error('[LLM提取] LLM响应格式不正确:', response);
        return [];
      }

      const content = response.content;
      const jsonMatch = content.match(/\{[\s\S]*"products"[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[LLM提取] 提取到 ${result.products?.length || 0} 个产品`);
        return result.products || [];
      } else {
        // 尝试直接解析整个内容
        const result = JSON.parse(content);
        console.log(`[LLM提取] 提取到 ${result.products?.length || 0} 个产品`);
        return result.products || [];
      }
    } catch (e) {
      console.error('[LLM提取] JSON解析失败:', e);
      return [];
    }
  } catch (error) {
    console.error('[LLM提取] 失败:', error);
    return [];
  }
}
