/**
 * 八爪鱼 RPA 采集模块
 * 通过 API 触发八爪鱼采集任务，并获取采集结果
 */

export interface CollectionCategory {
  id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
}

interface OctopusCollectionResult {
  id?: string;
  taskName: string;
  status: 'success' | 'failed' | 'pending';
  data?: any[];
  error?: string;
  totalCollected?: number;
}

const OCTOPUS_API_KEY = process.env.OCTOPUS_RPA_API_KEY || '';
const OCTOPUS_API_URL = process.env.OCTOPUS_RPA_API_URL || 'https://mcp.bazhuayu.com';

/**
 * 触发八爪鱼 RPA 采集任务
 */
export async function triggerOctopusCollection(category: CollectionCategory): Promise<any[]> {
  const apiKey = OCTOPUS_API_KEY;

  if (!apiKey) {
    console.log('[Octopus] OCTOPUS_RPA_API_KEY 未配置，跳过采集');
    return [];
  }

  const taskName = `采集_${category.name}`;
  const keywords = category.keywords || [];

  console.log(`[Octopus] 开始采集分类: ${category.name}, 关键词: ${keywords.join(', ')}`);

  try {
    // 1. 启动采集任务
    const startResponse = await fetch(`${OCTOPUS_API_URL}/api/collection/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        taskName,
        keywords,
        targetFields: [
          'product_name',
          'model',
          'brand',
          'price',
          'supplier',
          'contact_person',
          'contact_phone',
          'parameter_description',
          'category',
        ],
        maxResults: 100,
      }),
    });

    if (!startResponse.ok) {
      console.error(`[Octopus] 启动采集任务失败: HTTP ${startResponse.status}`);
      return [];
    }

    const startResult: OctopusCollectionResult = await startResponse.json();

    if (startResult.status === 'failed') {
      console.error(`[Octopus] 采集任务执行失败: ${startResult.error || '未知错误'}`);
      return [];
    }

    // 2. 获取采集结果
    const data = startResult.data || [];

    console.log(`[Octopus] 分类 "${category.name}" 采集完成，获取 ${data.length} 条数据`);
    return data;
  } catch (error) {
    console.error(`[Octopus] 采集分类 "${category.name}" 时发生网络错误:`, error);
    return [];
  }
}

/**
 * 批量采集多个分类
 */
export async function collectAllCategories(categories: CollectionCategory[]): Promise<any[]> {
  const allResults: any[] = [];

  for (const category of categories) {
    const results = await triggerOctopusCollection(category);
    allResults.push(...results);
  }

  return allResults;
}
