/**
 * OpenClaw CNC Node.js 调用封装
 * 通过 spawn 调用虚拟环境中的 Python 执行 bridge.py
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CNCAnalysisResult, CNCBridgeResponse, CNCQuoteRequest, CNCQuoteResult } from './types';

/**
 * 获取可用的 Python 解释器路径
 * 优先级：环境变量 OPENCLAW_PYTHON > 项目内 openclaw-env > 系统 python3
 */
export function getPythonPath(): string {
  if (process.env.OPENCLAW_PYTHON) {
    return process.env.OPENCLAW_PYTHON;
  }
  const candidates = [
    path.join(process.cwd(), 'openclaw-env', 'bin', 'python'),
    '/home/xshj/quote-project/openclaw-env/bin/python',
    '/root/quote-project/openclaw-env/bin/python',
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return 'python3';
}

/**
 * 调用 Python 桥接脚本
 * @param input 传给脚本的 JSON 指令
 */
export function runBridge(input: Record<string, unknown>): Promise<CNCBridgeResponse> {
  return new Promise((resolve) => {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(process.cwd(), 'src', 'lib', 'openclaw-cnc', 'bridge.py');

    let child;
    try {
      child = spawn(pythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ success: false, error: `无法启动 Python: ${String(err)}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ success: false, error: 'Python 执行超时（30 秒）' });
    }, 30_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: `Python 进程错误: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout.trim()) {
        resolve({
          success: false,
          error: `Python 退出码 ${code}: ${stderr.trim() || '未知错误'}`,
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as CNCBridgeResponse;
        resolve(parsed);
      } catch {
        resolve({
          success: false,
          error: `Python 输出解析失败: ${stdout.trim() || stderr.trim()}`,
        });
      }
    });

    try {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: `写入 Python stdin 失败: ${String(err)}` });
    }
  });
}

/**
 * 图纸/模型分析
 */
export async function analyzeDrawing(
  filePath: string,
  fileName: string,
  density?: number,
): Promise<CNCAnalysisResult> {
  const res = await runBridge({
    action: 'analyze',
    filePath,
    fileName,
    density,
  });
  // bridge.py 直接返回业务结果（无 data 包裹时使用 res 本身）
  const data = (res.data !== undefined ? res.data : res) as unknown as CNCAnalysisResult;
  if (!data.success) {
    return {
      success: false,
      format: '',
      fileName,
      error: data.error || res.error || '分析失败',
    };
  }
  return data;
}

/**
 * CNC 报价
 */
export async function generateCncQuote(
  req: CNCQuoteRequest,
): Promise<CNCQuoteResult> {
  const res = await runBridge({
    action: 'quote',
    material: req.material,
    length: req.length,
    width: req.width,
    height: req.height,
    quantity: req.quantity,
    tolerance: req.tolerance,
    surfaceTreatment: req.surfaceTreatment,
    complexity: req.complexity,
  });
  // bridge.py 直接返回业务结果（无 data 包裹时使用 res 本身）
  const data = (res.data !== undefined ? res.data : res) as unknown as CNCQuoteResult;
  if (!data.success) {
    return {
      success: false,
      material: req.material,
      materialCost: 0,
      machiningCost: 0,
      surfaceTreatmentCost: 0,
      setupCost: 0,
      unitPrice: 0,
      totalPrice: 0,
      deliveryDays: 0,
      breakdown: [],
      error: data.error || res.error || '报价计算失败',
    };
  }
  return data;
}
