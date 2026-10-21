#!/bin/bash

echo "🔍 开始批量修复未使用变量..."

# 获取所有包含未使用变量警告的文件和行号
npx eslint src/ --format=json 2>&1 | grep -v "ESLintIgnoreWarning" | \
  node -e "
    const fs = require('fs');
    const path = require('path');
    
    let data = [];
    try {
      const input = '';
      process.stdin.on('data', chunk => {
        input += chunk;
      });
      process.stdin.on('end', () => {
        const jsonStart = input.indexOf('[');
        const jsonEnd = input.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = input.substring(jsonStart, jsonEnd + 1);
          data = JSON.parse(jsonString);
        }
        
        let totalFixed = 0;
        const fileChanges = new Map();
        
        // 收集所有需要修改的行
        data.forEach(file => {
          if (!file.messages || file.messages.length === 0) return;
          
          const unusedVars = file.messages.filter(m => 
            m.ruleId && m.ruleId.includes('no-unused-vars')
          );
          
          if (unusedVars.length > 0) {
            if (!fileChanges.has(file.filePath)) {
              fileChanges.set(file.filePath, new Set());
            }
            
            unusedVars.forEach(warning => {
              fileChanges.get(file.filePath).add(warning.line);
            });
          }
        });
        
        // 对每个文件进行处理
        fileChanges.forEach((lines, filePath) => {
          let content = fs.readFileSync(filePath, 'utf8');
          const contentLines = content.split('\n');
          
          // 按行号从大到小排序，避免行号变化
          const sortedLines = Array.from(lines).sort((a, b) => b - a);
          
          sortedLines.forEach(lineNum => {
            const lineIndex = lineNum - 1;
            if (lineIndex < 0 || lineIndex >= contentLines.length) return;
            
            const line = contentLines[lineIndex];
            
            // 跳过已经有下划线前缀的
            if (/\\b_[a-zA-Z]/.test(line)) return;
            
            // 跳过注释行
            if (/^\\s*\\//.test(line) || /^\\s*\\*/.test(line)) return;
            
            // 跳过导入语句中的变量（ESLint 会报告但不需要处理）
            if (/^\\s*import/.test(line)) return;
            
            // 处理参数
            // 匹配函数参数或箭头函数参数
            if (/(\\(|\\{)\\s*([a-zA-Z][a-zA-Z0-9]*)\\s*([,)\\}]|$)/.test(line)) {
              const newLine = line.replace(/\\b([a-zA-Z][a-zA-Z0-9]*)\\b(?!\\s*[:,])/g, (match, varName, pos) => {
                // 跳过已经处理的
                if (varName.startsWith('_')) return match;
                // 跳过 TypeScript 关键字
                if (['interface', 'type', 'class', 'enum', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'extends', 'static', 'async', 'await', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'never', 'any', 'unknown', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint'].includes(varName)) {
                  return match;
                }
                return '_' + varName;
              });
              
              if (newLine !== line) {
                contentLines[lineIndex] = newLine;
                console.log('  修复: ' + path.relative(process.cwd(), filePath) + ':' + lineNum);
                totalFixed++;
              }
            }
          });
          
          // 写回文件
          const newContent = contentLines.join('\\n');
          if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
          }
        });
        
        console.log('\\n✅ 完成！修复了 ' + totalFixed + ' 处');
      });
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  "

echo "🔄 运行 ESLint 自动修复..."
npx eslint src/ --fix

echo "📊 检查剩余警告..."
npx eslint src/ --format=json 2>&1 | grep -v "ESLintIgnoreWarning" | \
  node -e "
    const input = '';
    process.stdin.on('data', chunk => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      try {
        const jsonStart = input.indexOf('[');
        const jsonEnd = input.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = input.substring(jsonStart, jsonEnd + 1);
          const data = JSON.parse(jsonString);
          
          const remaining = data.reduce((sum, f) => {
            const unused = f.messages.filter(m => m.ruleId && m.ruleId.includes('no-unused-vars'));
            return sum + unused.length;
          }, 0);
          
          console.log('🎉 剩余警告: ' + remaining);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
  "
