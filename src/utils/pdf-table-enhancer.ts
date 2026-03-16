/**
 * PDF表格解析增强模块
 * 提供表格结构识别、行合并、列识别等高级功能
 */

export interface TableCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rowIndex: number;
  colIndex: number;
}

export interface TableRow {
  cells: string[];
  x: number;
  y: number;
  height: number;
  originalIndex: number;
}

export interface ColumnInfo {
  index: number;
  header?: string;
  type: ColumnType;
  confidence: number;
  x: number;
  width: number;
}

export type ColumnType =
  | 'unknown'
  | 'name'
  | 'parameter_description'
  | 'brand'
  | 'unit'
  | 'quantity'
  | 'unit_price'
  | 'subtotal'
  | 'market_price'
  | 'operation'
  | 'serial_number';

/**
 * 表格行合并器
 * 智能识别跨行单元格并合并
 */
export class TableMerger {
  private readonly verticalGapThreshold: number; // 垂直间距阈值
  private readonly horizontalAlignThreshold: number; // 水平对齐阈值

  constructor(verticalGapThreshold = 30, horizontalAlignThreshold = 20) {
    this.verticalGapThreshold = verticalGapThreshold;
    this.horizontalAlignThreshold = horizontalAlignThreshold;
  }

  /**
   * 合并表格行
   */
  public mergeRows(rows: TableRow[]): TableRow[] {
    console.log('📊 [行合并开始]', { 行数: rows.length });

    if (rows.length === 0) return [];

    const mergedRows: TableRow[] = [];
    let currentRow: TableRow | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (currentRow === null) {
        currentRow = row;
        console.log(`  初始化行 ${i + 1}:`, row.cells.join(' | '));
      } else if (this.shouldMergeWithPrevious(row, currentRow)) {
        console.log(`  合并行 ${i + 1} 到前一行:`, {
          当前行: row.cells.join(' | '),
          前一行: currentRow.cells.join(' | ')
        });
        currentRow = this.mergeTwoRows(currentRow, row);
      } else {
        mergedRows.push(currentRow);
        currentRow = row;
      }
    }

    if (currentRow !== null) {
      mergedRows.push(currentRow);
    }

    console.log(`✅ [行合并完成] 合并前: ${rows.length}行, 合并后: ${mergedRows.length}行`);

    return mergedRows;
  }

  /**
   * 判断是否应该与前一行合并
   */
  private shouldMergeWithPrevious(currentRow: TableRow, previousRow: TableRow): boolean {
    console.log('\n    🔍 [判断合并] 检查当前行是否应合并到上一行');

    // 规则1：垂直距离很近
    const yGap = Math.abs(currentRow.y - (previousRow.y + previousRow.height));
    console.log(`      规则1 - 垂直距离: ${yGap}px (阈值: ${this.verticalGapThreshold}px)`);
    
    if (yGap > this.verticalGapThreshold) {
      console.log('      ❌ 距离过远，不合并');
      return false;
    }

    // 规则2：水平位置对齐
    const xAlignScore = this.calculateXAlignment(currentRow, previousRow);
    console.log(`      规则2 - 水平对齐度: ${xAlignScore.toFixed(2)} (阈值: 0.6)`);
    
    if (xAlignScore < 0.6) {
      console.log('      ❌ 水平对齐度低，不合并');
      return false;
    }

    // 规则3：内容特征判断（优先级最高）
    const continuationResult = this.hasContinuationPattern(currentRow, previousRow);
    console.log(`      规则3 - 内容延续模式: ${continuationResult.found ? continuationResult.reason : '无'}`);
    
    if (continuationResult.found) {
      console.log('      ✅ 检测到内容延续模式，合并');
      return true;
    }

    // 规则4：当前行较短且第一列为空（可能是续行）
    const isContinuation = this.isLikelyContinuationRow(currentRow, previousRow);
    console.log(`      规则4 - 疑似续行: ${isContinuation}`);
    
    if (isContinuation) {
      console.log('      ✅ 判断为续行，合并');
      return true;
    }

    console.log('      ❌ 不满足合并条件，不合并');
    return false;
  }

  /**
   * 计算水平对齐得分
   */
  private calculateXAlignment(row1: TableRow, row2: TableRow): number {
    if (row1.cells.length === 0 || row2.cells.length === 0) return 0;

    let alignedCells = 0;
    const minCells = Math.min(row1.cells.length, row2.cells.length);

    for (let i = 0; i < minCells; i++) {
      if (Math.abs(row1.x - row2.x) < this.horizontalAlignThreshold) {
        alignedCells++;
      }
    }

    return alignedCells / row1.cells.length;
  }

  /**
   * 识别内容延续模式（增强版）
   */
  private hasContinuationPattern(currentRow: TableRow, previousRow: TableRow): {
    found: boolean;
    reason: string;
  } {
    const prevText = previousRow.cells.join(' ');
    const currText = currentRow.cells.join(' ');
    const prevLastCell = previousRow.cells[previousRow.cells.length - 1] || '';
    const currFirstCell = currentRow.cells[0] || '';

    console.log(`      分析内容: 上一行末尾="${prevLastCell.substring(0, 20)}", 当前行开头="${currFirstCell.substring(0, 20)}"`);

    const checks = [
      // 检查1：上一行以品牌名结尾（如"电机："、"佳木斯/"）
      {
        pattern: /[品牌厂家制造商][：:]?[\u4e00-\u9fa5]{2,10}$/.test(prevText),
        reason: '上一行以品牌名结尾',
      },
      // 检查2：上一行以分隔符结尾
      {
        pattern: /[、；，、;]$/.test(prevText),
        reason: '上一行以分隔符结尾',
      },
      // 检查3：上一行以"/"结尾（品牌拆分标志）
      {
        pattern: /\/$/.test(prevLastCell),
        reason: '上一行以"/"结尾（品牌拆分）',
      },
      // 检查4：上一行以":"或"："结尾（参数说明）
      {
        pattern: /[:：]$/.test(prevLastCell),
        reason: '上一行以冒号结尾（参数说明）',
      },
      // 检查5：当前行以规格参数开头
      {
        pattern: /^(φ|Φ|DN|型号|规格|参数|技术|材质|功率|容量)/i.test(currFirstCell),
        reason: '当前行以规格参数开头',
      },
      // 检查6：当前行以数字+×+数字开头（尺寸规格）
      {
        pattern: /^\d+[\s]*[×*]\d+/.test(currFirstCell),
        reason: '当前行以尺寸规格开头',
      },
      // 检查7：当前行较短（<20字符）且上一行较长（>40字符）
      {
        pattern: currText.length < 20 && prevText.length > 40,
        reason: '当前行较短且上一行较长',
      },
      // 检查8：检测到常见的品牌拆分模式
      {
        pattern: this.detectBrandSplit(prevText, currText),
        reason: '检测到品牌拆分模式',
      },
    ];

    for (const check of checks) {
      if (check.pattern) {
        console.log(`      ✅ 匹配: ${check.reason}`);
        return { found: true, reason: check.reason };
      }
    }

    return { found: false, reason: '' };
  }

  /**
   * 检测品牌拆分模式
   */
  private detectBrandSplit(prevText: string, currText: string): boolean {
    // 常见品牌拆分模式
    const splitPatterns = [
      // "佳木斯/" + "电机" 或 "减速机"
      /佳木斯\s*\/\s*(?:电机|减速机)/i.test(prevText + ' ' + currText),
      // "宁波动力/" + "减速机"
      /宁波动力\s*\/\s*减速机/i.test(prevText + ' ' + currText),
      // "哈瓦洛/" + "轴承"
      /哈瓦洛\s*\/\s*轴承/i.test(prevText + ' ' + currText),
      // "Harbin/" + "Bearing"
      /Harbin\s*\/\s*Bearing/i.test(prevText + ' ' + currText),
      // 上行以"佳木斯"、"宁波动力"等品牌名结尾，下行以"电机"、"减速机"开头
      /(?:佳木斯|宁波动力|哈瓦洛|西门子|ABB)\s*$/.test(prevText) &&
      /^(?:电机|减速机|轴承|变频器)/.test(currText),
    ];

    return splitPatterns.some(pattern => pattern);
  }

  /**
   * 判断是否为可能的续行
   */
  private isLikelyContinuationRow(currentRow: TableRow, previousRow: TableRow): boolean {
    // 当前行第一列为空
    if (!currentRow.cells[0] || currentRow.cells[0].trim() === '') {
      return true;
    }

    // 当前行较短（少于20字符）且上一行较长（多于30字符）
    const currLength = currentRow.cells.join('').length;
    const prevLength = previousRow.cells.join('').length;

    if (currLength < 20 && prevLength > 30) {
      return true;
    }

    return false;
  }

  /**
   * 合并两行（增强版）
   */
  private mergeTwoRows(row1: TableRow, row2: TableRow): TableRow {
    console.log(`      🔄 [合并行] 开始合并`);
    
    const mergedCells: string[] = [];
    const maxCells = Math.max(row1.cells.length, row2.cells.length);

    for (let i = 0; i < maxCells; i++) {
      const cell1 = row1.cells[i] || '';
      const cell2 = row2.cells[i] || '';

      if (cell2 && cell2.trim() !== '') {
        // 智能选择分隔符
        let separator = this.selectSeparator(cell1, cell2);
        
        // 特殊处理：品牌拆分（如"佳木斯/" + "电机"）
        if (cell1.endsWith('/') && this.isBrandPart(cell2)) {
          separator = '';
        }
        
        // 特殊处理：参数说明（如"功率：" + "11kW"）
        if (cell1.endsWith('：') || cell1.endsWith(':')) {
          separator = '';
        }
        
        // 特殊处理：上一行以逗号、分号等结尾
        if (/[、;；,，]$/.test(cell1)) {
          separator = '';
        }
        
        const merged = (cell1 + separator + cell2).trim();
        mergedCells.push(merged);
        
        console.log(`        列${i}: "${cell1.substring(0, 15)}..." + "${cell2.substring(0, 15)}..." → "${merged.substring(0, 25)}..."`);
      } else {
        mergedCells.push(cell1);
      }
    }

    console.log(`      ✅ [合并行] 完成，共${maxCells}列`);

    return {
      cells: mergedCells,
      x: Math.min(row1.x, row2.x),
      y: Math.min(row1.y, row2.y),
      height: (row2.y + row2.height) - row1.y,
      originalIndex: Math.min(row1.originalIndex, row2.originalIndex),
    };
  }

  /**
   * 智能选择分隔符
   */
  private selectSeparator(cell1: string, cell2: string): string {
    const trimmed1 = cell1.trim();
    const trimmed2 = cell2.trim();

    // 如果第二列以"（"或"["开头，说明是补充说明
    if (/^[（\[]/.test(trimmed2)) {
      return '';
    }

    // 如果第二列是数字且第一列是单位或参数，不加空格
    if (/^\d/.test(trimmed2) && /[×*mm]$/.test(trimmed1)) {
      return '';
    }

    // 默认使用空格
    return ' ';
  }

  /**
   * 判断是否为品牌组成部分
   */
  private isBrandPart(text: string): boolean {
    const brandParts = ['电机', '减速机', '轴承', '变频器', 'Bearing', 'Motor', 'Reducer'];
    return brandParts.some(part => text.includes(part));
  }
}

/**
 * 列识别器
 * 智能识别表格列的类型
 */
export class ColumnIdentifier {
  private readonly commonHeaders: Map<string, ColumnType> = new Map([
    ['序号', 'serial_number'],
    ['产品名称', 'name'],
    ['名称', 'name'],
    ['产品', 'name'],
    ['型号', 'parameter_description'],
    ['规格', 'parameter_description'],
    ['参数', 'parameter_description'],
    ['参数描述', 'parameter_description'],
    ['品牌', 'brand'],
    ['厂家', 'brand'],
    ['制造商', 'brand'],
    ['单位', 'unit'],
    ['数量', 'quantity'],
    [' Qty ', 'quantity'],
    ['单价', 'unit_price'],
    ['价格', 'unit_price'],
    ['小计', 'subtotal'],
    ['合计', 'subtotal'],
    ['总额', 'subtotal'],
    ['市场参考价', 'market_price'],
    ['操作', 'operation'],
  ]);

  /**
   * 识别列类型
   */
  public identifyColumns(headerRow: TableRow, dataRows: TableRow[]): ColumnInfo[] {
    console.log('📊 [列识别开始]', {
      表头: headerRow.cells,
      数据行数: dataRows.length,
    });

    const columnInfos: ColumnInfo[] = [];

    // 基于表头文本识别
    headerRow.cells.forEach((header, index) => {
      const type = this.guessColumnTypeFromHeader(header);
      columnInfos.push({
        index,
        header: header.trim(),
        type,
        confidence: 0.7,
        x: headerRow.x, // 简化处理
        width: 100, // 简化处理
      });

      console.log(`  列${index} "${header}" → 类型: ${type}, 置信度: 0.7`);
    });

    // 基于数据内容验证和调整
    if (dataRows.length > 0) {
      columnInfos.forEach(col => {
        const sampleData = dataRows
          .map(row => row.cells[col.index])
          .filter(cell => cell && cell.trim().length > 0)[0];

        if (sampleData) {
          const dataType = this.guessColumnTypeFromData(sampleData);
          
          if (dataType === col.type) {
            col.confidence += 0.2;
            console.log(`  ✅ 列${col.index}数据验证通过，置信度提升至 ${col.confidence.toFixed(1)}`);
          } else if (dataType !== 'unknown' && col.type === 'unknown') {
            col.type = dataType;
            col.confidence = 0.6;
            console.log(`  ⚠️ 列${col.index}类型修正为 ${dataType}`);
          }
        }
      });
    }

    console.log('✅ [列识别完成]');
    columnInfos.forEach(col => {
      console.log(`  列${col.index}: ${col.header} → ${col.type} (置信度: ${col.confidence.toFixed(1)})`);
    });

    return columnInfos;
  }

  /**
   * 基于表头猜测列类型
   */
  private guessColumnTypeFromHeader(header: string): ColumnType {
    const text = header.trim().toLowerCase();

    for (const [key, type] of this.commonHeaders) {
      if (text.includes(key.toLowerCase())) {
        return type;
      }
    }

    return 'unknown';
  }

  /**
   * 基于数据猜测列类型（增强版）
   */
  private guessColumnTypeFromData(data: string): ColumnType {
    const text = data.trim();

    // 1. 序号：纯数字且小于100，且不包含其他特征
    if (/^\d{1,3}$/.test(text) && parseInt(text) < 100) {
      return 'serial_number';
    }

    // 2. 数量：纯数字（但排除尺寸中的数字）
    if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) < 10000) {
      // 如果看起来像尺寸的一部分，则不是数量
      if (!this.looksLikeDimension(text)) {
        return 'quantity';
      }
    }

    // 3. 单价/小计：包含货币符号或数字格式
    if (/^[¥$€]?\s*[\d,]+\.\d{2}$|[\d,]+\.\d{2}\s*元?$/.test(text)) {
      // 如果金额大于10000，可能是小计
      const amount = parseFloat(text.replace(/[¥$元,]/g, ''));
      if (amount > 10000) {
        return 'subtotal';
      }
      return 'unit_price';
    }

    // 4. 单位：单个字或常见的单位词
    if (/^[套台个只根米千克kg吨条件批项次层组台]$/.test(text)) {
      return 'unit';
    }

    // 5. 规格/参数描述：包含φΦDN×等特殊字符或材质代码
    if (/[φΦDN×*]|\d+[×*]\d+mm?|Q235|304|316L|碳钢|不锈钢|玻璃钢|防腐/.test(text)) {
      return 'parameter_description';
    }

    // 6. 品牌：中文或英文品牌名（更全面的品牌列表）
    if (this.isBrandName(text)) {
      return 'brand';
    }

    // 7. 操作列：包含"编辑"、"删除"等操作按钮
    if (/编辑|删除|修改|查看|操作/.test(text)) {
      return 'operation';
    }

    return 'unknown';
  }

  /**
   * 判断文本是否像品牌名称
   */
  private isBrandName(text: string): boolean {
    const chineseBrands = [
      '佳木斯', '宁波动力', '哈瓦洛', '西门子', 'ABB', '施耐德', 
      '佳能', '惠普', '华为', '小米', '海尔', '格力', '美的', 'TCL',
      '三一', '中联', '徐工', '柳工', '龙工', '山推',
      '三菱', '松下', '东芝', '日立', '富士', '欧姆龙',
      '博世', '施克', '西克', '倍加福', '图尔克',
    ];

    const englishBrands = [
      'Siemens', 'ABB', 'Schneider', 'Bosch', 'Panasonic', 'Mitsubishi',
      'Omron', 'Sick', 'Pepperl+Fuchs', 'Turck', 'Keyence',
      'Harbin', 'Bearing', 'Motor', 'Reducer',
    ];

    // 检查中文品牌
    for (const brand of chineseBrands) {
      if (text.includes(brand)) {
        return true;
      }
    }

    // 检查英文品牌
    for (const brand of englishBrands) {
      if (text.toLowerCase().includes(brand.toLowerCase())) {
        return true;
      }
    }

    // 英文品牌名模式：首字母大写的单词
    if (/^[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*$/.test(text) && text.length > 3) {
      return true;
    }

    return false;
  }

  /**
   * 判断文本是否像尺寸规格
   */
  private looksLikeDimension(text: string): boolean {
    // 检查是否匹配常见尺寸模式
    return /^\d{3,5}$/.test(text) || // 3-5位数字可能是尺寸
           /^\d{2,4}\s*[×*]\s*\d{2,4}/.test(text) || // 2-4位×2-4位数字
           /^\d{2,4}\s*mm?$/.test(text); // 带mm单位
  }

  /**
   * 检测合并列
   */
  public detectMergedColumns(columns: ColumnInfo[]): Map<number, number[]> {
    const mergedColumns = new Map<number, number[]>();

    console.log('🔍 [检测合并列]');

    // 检查内容相似的相邻列
    for (let i = 0; i < columns.length - 1; i++) {
      const col1 = columns[i];
      const col2 = columns[i + 1];

      // 如果两列都是规格相关，可能是拆分列
      if (col1.type === 'parameter_description' && col2.type === 'parameter_description') {
        console.log(`  发现可能的合并列: 列${i} 和 列${i + 1}`);
        mergedColumns.set(i, [i, i + 1]);
      }

      // 如果前一列是产品名称，后一列是规格，可能需要合并
      if (col1.type === 'name' && col2.type === 'parameter_description') {
        console.log(`  发现可能需要合并的列: 列${i} (名称) 和 列${i + 1} (规格)`);
        // 不自动标记为合并列，但提供信息
      }
    }

    console.log(`✅ [合并列检测完成] 发现 ${mergedColumns.size} 组合并列`);

    return mergedColumns;
  }
}

/**
 * 文本增强器
 * 提供文本提取、清洗、修复等功能
 */
export class TextEnhancer {
  /**
   * 提取表格文本内容
   */
  public extractTableText(text: string): string[] {
    console.log('📝 [提取表格文本]', { 原始长度: text.length });

    // 按行分割
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    console.log(`  提取到 ${lines.length} 行文本`);

    return lines;
  }

  /**
   * 解析行数据
   */
  public parseRowData(line: string, expectedCols: number = 8): string[] {
    // 尝试多种分隔符
    const separators = [/\s{2,}/, /\t/, /\|/, /,|，/];
    let cells: string[] = [];

    for (const separator of separators) {
      cells = line.split(separator).map(cell => cell.trim()).filter(cell => cell.length > 0);
      
      if (cells.length >= expectedCols * 0.6) {
        break; // 找到合适的分隔符
      }
    }

    // 如果分割失败，尝试按固定宽度分割
    if (cells.length < expectedCols * 0.6) {
      cells = this.splitByFixedWidth(line, expectedCols);
    }

    return cells;
  }

  /**
   * 按固定宽度分割
   */
  private splitByFixedWidth(line: string, expectedCols: number): string[] {
    const avgWidth = line.length / expectedCols;
    const cells: string[] = [];

    for (let i = 0; i < expectedCols; i++) {
      const start = Math.floor(i * avgWidth);
      const end = Math.floor((i + 1) * avgWidth);
      cells.push(line.substring(start, end).trim());
    }

    return cells;
  }

  /**
   * 修复文本中的常见问题
   */
  public fixTextIssues(text: string): string {
    let fixed = text;

    // 修复换行导致的单词拆分
    fixed = fixed.replace(/([a-zA-Z])\n([a-zA-Z])/g, '$1$2');
    
    // 修复品牌信息拆分（如"佳木斯/"和"减速机"）
    fixed = this.fixBrokenBrands(fixed);
    
    // 修复数字和单位分离
    fixed = fixed.replace(/(\d+)\s+([×*])\s+(\d+)/g, '$1$2$3');
    
    // 规范化空白字符
    fixed = fixed.replace(/\s+/g, ' ').trim();

    return fixed;
  }

  /**
   * 修复被拆分的品牌信息
   */
  private fixBrokenBrands(text: string): string {
    const brandPairs = [
      ['佳木斯', '电机'],
      ['宁波动力', '减速机'],
      ['哈瓦洛', '轴承'],
      ['Harbin', 'Bearing'],
    ];

    let fixed = text;

    for (const [brand1, brand2] of brandPairs) {
      // 匹配 "品牌1/ 品牌2" 或 "品牌1:品牌2" 模式
      const pattern = new RegExp(`${brand1}[/：:：]\\s*${brand2}`, 'g');
      fixed = fixed.replace(pattern, `${brand1}/${brand2}`);
    }

    return fixed;
  }
}

/**
 * PDF表格解析增强器主类
 */
export class PdfTableEnhancer {
  private merger: TableMerger;
  private columnIdentifier: ColumnIdentifier;
  private textEnhancer: TextEnhancer;

  constructor(
    verticalGapThreshold = 30,
    horizontalAlignThreshold = 20
  ) {
    this.merger = new TableMerger(verticalGapThreshold, horizontalAlignThreshold);
    this.columnIdentifier = new ColumnIdentifier();
    this.textEnhancer = new TextEnhancer();
  }

  /**
   * 增强表格解析
   */
  public enhanceTable(text: string): {
    rows: TableRow[];
    columns: ColumnInfo[];
    mergedColumns: Map<number, number[]>;
  } {
    console.log('\n🚀 [表格增强开始]');

    // 1. 提取文本行
    const lines = this.textEnhancer.extractTableText(text);

    // 2. 解析行数据
    const rawRows = lines.map((line, index) => ({
      cells: this.textEnhancer.parseRowData(line),
      x: 0,
      y: index * 20, // 简化处理
      height: 20,
      originalIndex: index,
    }));

    console.log(`📊 解析到 ${rawRows.length} 行原始数据`);

    // 3. 合并行
    const mergedRows = this.merger.mergeRows(rawRows);

    // 4. 识别列
    if (mergedRows.length > 0) {
      const headerRow = mergedRows[0];
      const dataRows = mergedRows.slice(1);

      const columns = this.columnIdentifier.identifyColumns(headerRow, dataRows);
      const mergedColumns = this.columnIdentifier.detectMergedColumns(columns);

      console.log('🚀 [表格增强完成]\n');

      return {
        rows: mergedRows,
        columns,
        mergedColumns,
      };
    }

    return {
      rows: [],
      columns: [],
      mergedColumns: new Map(),
    };
  }

  /**
   * 从增强的表格中提取产品信息（增强版日志）
   */
  public extractProductsFromEnhancedTable(
    enhancedTable: {
      rows: TableRow[];
      columns: ColumnInfo[];
      mergedColumns: Map<number, number[]>;
    }
  ): any[] {
    console.log('\n📦 [从增强表格提取产品] 开始');
    
    const products: any[] = [];
    const rows = enhancedTable.rows;
    const columns = enhancedTable.columns;

    console.log(`  📊 可用列: ${columns.length}`);
    columns.forEach((col, i) => {
      console.log(`    ${i + 1}. "${col.header}" → ${col.type} (置信度: ${col.confidence.toFixed(1)})`);
    });

    // 跳过表头
    console.log(`\n  📝 开始处理数据行（共${rows.length - 1}行）`);
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      console.log(`\n  行 ${i + 1}/${rows.length}:`, row.cells.slice(0, 3).join(' | '));
      
      const product: any = {};

      // 根据列类型映射字段
      columns.forEach(col => {
        const value = row.cells[col.index] || '';
        
        if (value) {
          console.log(`    列"${col.header}" (${col.type}): ${value.substring(0, 30)}...`);
        }

        switch (col.type) {
          case 'name':
            product.name = value;
            break;
          case 'parameter_description':
            product.parameter_description = value;
            break;
          case 'brand':
            product.brand = value;
            break;
          case 'quantity':
            product.quantity = parseInt(value) || 1;
            break;
          case 'unit':
            product.unit = value || '个';
            break;
          case 'unit_price':
            product.price = parseFloat(value.replace(/[¥$元,]/g, '')) || 0;
            break;
          case 'subtotal':
            product.total = parseFloat(value.replace(/[¥$元,]/g, '')) || 0;
            break;
          default:
            // 忽略其他列
            break;
        }
      });

      // 如果没有参数描述，尝试合并所有未知列
      if (!product.parameter_description) {
        const unknownCols = columns.filter(col => col.type === 'unknown');
        if (unknownCols.length > 0) {
          console.log(`    ℹ️ 无参数描述列，尝试合并${unknownCols.length}个未知列`);
          const desc = unknownCols
            .map(col => row.cells[col.index])
            .filter(cell => cell)
            .join(' ');
          
          if (desc) {
            product.parameter_description = desc;
            console.log(`    合并结果: ${desc.substring(0, 50)}...`);
          }
        }
      }

      // 修复文本问题
      if (product.parameter_description) {
        const beforeFix = product.parameter_description;
        product.parameter_description = this.textEnhancer.fixTextIssues(
          product.parameter_description
        );
        if (beforeFix !== product.parameter_description) {
          console.log(`    🔧 修复文本问题`);
        }
      }

      if (product.name && product.name.length > 0) {
        console.log(`    ✅ 提取产品: ${product.name}`);
        products.push(product);
      } else {
        console.log(`    ⚠️ 跳过：无产品名称`);
      }
    }

    console.log(`\n✅ 提取完成，共 ${products.length} 个产品\n`);

    return products;
  }
}
// test
