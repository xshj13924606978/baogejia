/**
 * 数据来源追踪（#[20260827-1030]-7）
 *
 * 每个进入方案的数据都必须标注来源（产品价格库 / 定额库 / 联网搜索 /
 * 规则估算 / 资料库 / 公司信息库），实现"所有数据有来源标注，无硬编码"。
 *
 * 每次方案生成应使用独立的 Tracker 实例（服务端按请求隔离）。
 */
import { isDataSourceTrackingEnabled, type PriceSource } from './price-resolver';

export type DataSourceType =
  | PriceSource
  | 'knowledge_db'
  | 'company_db'
  | 'customer_db'
  | 'rule'
  | 'user_input';

export interface DataSourceEntry {
  /** 数据项名称，如"板框压滤机 100m²" */
  label: string;
  /** 数据值/说明，如"234,000 元/台" */
  detail: string;
  /** 来源分类（中文），如"产品价格库""定额库""资料库" */
  source: string;
  sourceType: DataSourceType;
  /** 参考链接（联网搜索时） */
  url?: string;
}

export class DataSourceTracker {
  private _entries: DataSourceEntry[] = [];

  /** 记录一条数据来源（受 ENABLE_DATA_SOURCE_TRACKING 开关控制） */
  track(entry: DataSourceEntry): void {
    if (!isDataSourceTrackingEnabled()) return;
    this._entries.push(entry);
  }

  /** 批量记录 */
  trackAll(entries: DataSourceEntry[]): void {
    for (const e of entries) this.track(e);
  }

  get entries(): DataSourceEntry[] {
    return [...this._entries];
  }

  clear(): void {
    this._entries = [];
  }

  /** 生成 Markdown 数据来源表（追加到方案末尾） */
  toMarkdown(): string {
    if (this._entries.length === 0) return '';
    const rows = this._entries
      .map(
        (e) =>
          `| ${e.label.replace(/\|/g, '｜')} | ${e.detail.replace(/\|/g, '｜')} | ${e.source}${e.url ? ` [链接](${e.url})` : ''} |`
      )
      .join('\n');
    return [
      '## 数据来源',
      '',
      '| 数据项 | 数据/说明 | 来源 |',
      '| --- | --- | --- |',
      rows,
      '',
      '> 说明：价格数据遵循"产品价格库 → 定额库 → 联网搜索 → 规则估算"优先级；规则估算价为估算值，建议补充到产品价格库后重新生成以校准。',
    ].join('\n');
  }

  /** 生成结构化 JSON（入库/调试用） */
  toJSON(): DataSourceEntry[] {
    return this.entries;
  }
}

export function createDataSourceTracker(): DataSourceTracker {
  return new DataSourceTracker();
}
