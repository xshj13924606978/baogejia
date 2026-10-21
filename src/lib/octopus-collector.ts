/**
 * 八爪鱼 RPA 采集模块
 * 通过 MCP 协议（JSON-RPC 2.0 over HTTP/SSE）调用八爪鱼 RPA 采集任务，并获取采集结果
 *
 * 八爪鱼 RPA MCP 工具：
 * - automation_search: 搜索/列出采集模板（自动化）
 * - automation_details: 获取模板详情与参数
 * - automation_call: 运行模板
 * - automation_run_status: 查询运行状态与结果
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

interface OctopusAutomation {
  id: string;
  name: string;
  description: string;
  availability: string;
}

const OCTOPUS_API_KEY = process.env.OCTOPUS_RPA_API_KEY || '';
const OCTOPUS_API_URL = process.env.OCTOPUS_RPA_API_URL || 'https://mcp-rpa.bazhuayu.com';

// 不可用的模板状态（需要购买/升级）
const UNAVAILABLE_STATES = ['need_purchase', 'need_upgrade_package'];

/**
 * 调用八爪鱼 MCP 工具（JSON-RPC 2.0 over HTTP/SSE）
 */
async function mcpCall(toolName: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch(OCTOPUS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-api-key': OCTOPUS_API_KEY,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now() + Math.floor(Math.random() * 10000),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    console.error(`[Octopus] MCP 调用 ${toolName} 失败: HTTP ${response.status}`);
    return null;
  }

  const text = await response.text();
  const dataLines = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6));

  if (dataLines.length === 0) {
    console.error(`[Octopus] MCP 调用 ${toolName} 无有效响应: ${text.slice(0, 200)}`);
    return null;
  }

  try {
    return JSON.parse(dataLines.join(''));
  } catch (e) {
    console.error(`[Octopus] MCP 调用 ${toolName} 响应解析失败:`, e);
    return null;
  }
}

/**
 * 从 MCP 结果中提取文本内容
 */
function extractText(result: any): string {
  if (!result || !result.result) return '';
  const content = result.result.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c && c.type === 'text')
    .map((c: any) => c.text || '')
    .join('\n');
}

/**
 * 解析 Markdown 表格文本为对象数组
 * 表头形如: | Id | Source | Name | Description | Availability |
 */
function parseMarkdownTable(text: string): Record<string, string>[] {
  const lines = text.split('\n');
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));

    // 跳过空行和分隔行
    if (cells.length === 0 || cells.every((c) => /^[-: ]+$/.test(c))) continue;

    if (headers.length === 0) {
      headers = cells;
      continue;
    }

    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i].toLowerCase()] = cells[i] || '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * 搜索采集模板（自动化）
 */
async function searchAutomations(keyword: string): Promise<OctopusAutomation[]> {
  const args: Record<string, unknown> = {};
  if (keyword) args.keyword = keyword;

  const res = await mcpCall('automation_search', args);
  const text = extractText(res);
  console.log(`[Octopus] automation_search("${keyword}") 结果:`, text.slice(0, 500));

  if (!text) return [];

  const rows = parseMarkdownTable(text);
  const automations: OctopusAutomation[] = [];

  for (const row of rows) {
    const id = row['id'];
    if (!id) continue;
    automations.push({
      id,
      name: row['name'] || '',
      description: row['description'] || '',
      availability: row['availability'] || '',
    });
  }

  return automations;
}

/**
 * 从模板详情中解析输入参数列表
 */
function extractAutomationParams(detailText: string): { name: string; displayName: string; type: string; required: boolean }[] {
  if (!detailText) return [];

  // 只解析 "Input Parameter Information" 之后的参数表
  const paramSection = detailText.split('## Input Parameter Information')[1];
  const rows = parseMarkdownTable(paramSection || detailText);

  const params: { name: string; displayName: string; type: string; required: boolean }[] = [];
  for (const row of rows) {
    const name = row['name'] || row['参数名'];
    if (!name) continue;
    params.push({
      name,
      displayName: row['display name'] || row['显示名'] || name,
      type: (row['type'] || row['类型'] || '').toLowerCase(),
      required: (row['required'] || row['必填'] || '').toLowerCase() === 'yes',
    });
  }

  return params;
}

/**
 * 根据模板参数列表构建调用参数
 * 将搜索关键词赋给"关键词"参数，其余必填参数留空（由模板默认值处理）
 */
function buildRunParameters(params: { name: string; displayName: string; type: string; required: boolean }[], keyword: string): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  for (const p of params) {
    // 关键词类参数：名称或显示名包含"关键词"/"keyword"
    if (
      /关键词|keyword/i.test(p.name) ||
      /关键词|keyword/i.test(p.displayName)
    ) {
      parameters[p.name] = keyword;
    }
  }

  return parameters;
}

/**
 * 从运行响应中提取 runId
 */
function extractRunId(text: string): string {
  if (!text) return '';

  // 尝试 JSON 解析
  try {
    const obj = JSON.parse(text);
    const id = obj.runId || obj.run_id || obj.id || (obj.data && (obj.data.runId || obj.data.id));
    if (id) return String(id);
  } catch {
    // 忽略，继续文本匹配
  }

  // 文本匹配 runId / run_id / Run ID
  const m = text.match(/run[_-]?id["':=\s]+([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];

  return '';
}

/**
 * 从运行状态文本中解析采集数据
 */
function parseCollectionData(text: string): any[] {
  if (!text) return [];

  // 尝试直接 JSON 解析
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) return obj;
    const arr = obj.data || obj.result || obj.results || obj.list || obj.records;
    if (Array.isArray(arr)) return arr;
  } catch {
    // 忽略，继续
  }

  // 尝试从文本中提取 JSON 数组
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return arr;
    } catch {
      // 忽略，继续
    }
  }

  // 尝试解析 Markdown 表格
  const rows = parseMarkdownTable(text);
  if (rows.length > 0) return rows;

  return [];
}

/**
 * 触发八爪鱼 RPA 采集任务
 */
export async function triggerOctopusCollection(category: CollectionCategory): Promise<any[]> {
  const apiKey = OCTOPUS_API_KEY;

  if (!apiKey) {
    console.log('[Octopus] OCTOPUS_RPA_API_KEY 未配置，跳过采集');
    return [];
  }

  const keywords = category.keywords || [];
  const searchKeyword = keywords[0] || category.name;

  console.log(`[Octopus] 开始采集分类: ${category.name}, 关键词: ${keywords.join(', ')}`);
  console.log('[Octopus] 采集请求参数:', {
    mcpServer: OCTOPUS_API_URL,
    searchKeyword,
    keywords,
  });

  try {
    // 1. 搜索采集模板（自动化）
    let automations = await searchAutomations(searchKeyword);

    // 若按关键词未找到，列出全部模板后再按名称/描述匹配
    if (automations.length === 0) {
      console.log(`[Octopus] 关键词 "${searchKeyword}" 未匹配到模板，列出全部模板后匹配`);
      const all = await searchAutomations('');
      automations = all.filter(
        (a) => a.name.includes(searchKeyword) || a.description.includes(searchKeyword)
      );
    }

    if (automations.length === 0) {
      console.warn(`[Octopus] 未找到匹配「${searchKeyword}」的采集模板`);
      console.warn('  请检查: 1. 八爪鱼 RPA 客户端中是否已添加/购买采集应用;');
      console.warn('          2. 类别关键词是否与采集模板名称/描述匹配');
      return [];
    }

    const automation = automations[0];
    console.log(
      `[Octopus] 使用采集模板: ${automation.name} (${automation.id}), 可用性: ${automation.availability}`
    );

    // 检查模板是否可用
    if (UNAVAILABLE_STATES.includes(automation.availability)) {
      const purchaseUrl =
        automation.availability === 'need_purchase'
          ? `https://rpa.bazhuayu.com/appstore/apps?appid=${automation.id.replace('app_store_app_', '')}`
          : 'https://rpa.bazhuayu.com/plan';
      console.warn(`[Octopus] 采集模板 "${automation.name}" 需要购买/升级才能使用`);
      console.warn(`[Octopus] 请前往购买: ${purchaseUrl}`);
      return [];
    }

    // 2. 获取模板详情（参数列表）
    const detailsRes = await mcpCall('automation_details', { id: automation.id });
    const detailText = extractText(detailsRes);
    console.log('[Octopus] 模板详情:', detailText.slice(0, 800));

    const params = extractAutomationParams(detailText);
    console.log('[Octopus] 模板参数:', JSON.stringify(params));

    // 3. 运行采集任务
    const parameters = buildRunParameters(params, searchKeyword);
    console.log(`[Octopus] 运行模板: ${automation.id}, 参数:`, JSON.stringify(parameters));

    const runRes = await mcpCall('automation_call', {
      id: automation.id,
      parameters,
    });
    const runText = extractText(runRes);
    console.log('[Octopus] 运行响应:', runText.slice(0, 1000));

    const runId = extractRunId(runText);
    if (!runId) {
      console.error('[Octopus] 无法从运行响应中获取 runId');
      console.warn('[Octopus] 可能原因: 机器人不在线或模板不可用');
      return [];
    }

    // 4. 查询运行状态（等待完成）
    console.log(`[Octopus] 查询运行状态: runId=${runId}`);
    const statusRes = await mcpCall('automation_run_status', { runId, wait: true });
    const statusText = extractText(statusRes);
    console.log('[Octopus] 运行状态:', statusText.slice(0, 1500));

    // 5. 解析采集数据
    const data = parseCollectionData(statusText);

    console.log(`[Octopus] 分类 "${category.name}" 采集完成，获取 ${data.length} 条数据`);
    if (data.length === 0) {
      console.warn('[Octopus] 未解析到结构化数据，原始返回:', statusText.slice(0, 1000));
    } else {
      console.log('[Octopus] 数据样本:', JSON.stringify(data[0], null, 2));
    }
    return data;
  } catch (error) {
    console.error(`[Octopus] 采集分类 "${category.name}" 时发生错误:`, error);
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
