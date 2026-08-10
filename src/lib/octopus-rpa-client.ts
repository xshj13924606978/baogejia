/**
 * 八爪鱼 RPA 客户端
 *
 * 网页数据采集工具，可以自动抓取网页内容、采集市场信息。
 * 与普通 AI 模型不同，它是采集工具，需要特殊处理。
 */

const OCTOPUS_API_KEY = process.env.OCTOPUS_RPA_API_KEY;
const OCTOPUS_API_URL = process.env.OCTOPUS_RPA_API_URL || 'https://mcp.bazhuayu.com';

export interface OctopusRPATask {
  taskId?: string;
  url: string;
  operation: 'crawl' | 'extract' | 'monitor';
  selector?: string;
  extractType?: 'text' | 'html' | 'table' | 'json';
  waitTime?: number;
}

export interface OctopusRPAResult {
  success: boolean;
  taskId?: string;
  data?: unknown;
  error?: string;
  executionTime?: number;
}

/**
 * 提交采集任务
 */
export async function submitOctopusTask(task: OctopusRPATask): Promise<string> {
  if (!OCTOPUS_API_KEY) {
    throw new Error('OCTOPUS_RPA_API_KEY 未配置');
  }

  const response = await fetch(`${OCTOPUS_API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OCTOPUS_API_KEY}`,
    },
    body: JSON.stringify({
      ...task,
      waitTime: task.waitTime || 10000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`八爪鱼 RPA 任务提交失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.taskId;
}

/**
 * 查询采集任务结果
 */
export async function getOctopusTaskResult(taskId: string): Promise<OctopusRPAResult> {
  if (!OCTOPUS_API_KEY) {
    throw new Error('OCTOPUS_RPA_API_KEY 未配置');
  }

  const response = await fetch(`${OCTOPUS_API_URL}/tasks/${taskId}/result`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${OCTOPUS_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`八爪鱼 RPA 查询结果失败 (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * 提交采集任务并等待完成
 */
export async function executeOctopusTask(
  task: OctopusRPATask,
  maxRetries = 10,
  retryInterval = 2000
): Promise<OctopusRPAResult> {
  const taskId = await submitOctopusTask(task);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, retryInterval));

    const result = await getOctopusTaskResult(taskId);

    if (result.success) {
      return result;
    }

    if (result.error) {
      throw new Error(`八爪鱼 RPA 采集错误: ${result.error}`);
    }
  }

  throw new Error(`八爪鱼 RPA 采集超时，任务 ID: ${taskId}`);
}

/**
 * 为用户消息解释如何采集数据（当没有 API Key 时）
 * 返回提示信息，引导用户提供 URL
 */
export function getOctopusAssistantMessage(userInput: string): string {
  const urlMatch = userInput.match(/https?:\/\/[^\s]+/);

  if (!urlMatch) {
    return `我正在使用**八爪鱼 RPA**进行数据采集。

请提供您需要采集的网页链接（URL），我将自动为您抓取数据。

**示例**：
- "帮我采集 https://example.com/prices 的价格数据"
- "抓取 https://www.1688.com/xxx 的商品信息"`;
  }

  return `正在通过**八爪鱼 RPA**采集网页数据：

目标 URL: \`${urlMatch[0]}\`

> ⚠️ **八爪鱼 RPA 服务正在进行数据采集任务**
> 如果采集结果未返回，请检查 API Key 配置是否正确。
> 
> **当前支持的采集功能**：
> - 📄 网页文本内容提取
> - 📊 表格数据抓取
> - 📋 结构化数据导出
> - 🔍 市场情报采集`;
}
