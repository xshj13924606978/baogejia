'use client';

import { useState } from 'react';

export default function ImportDiagnostics() {
  const [dbQueryResult, setDbQueryResult] = useState('');
  const [dbSchemaResult, setDbSchemaResult] = useState('');
  const [simulateResult, setSimulateResult] = useState('');
  const [insertResult, setInsertResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const testDbQuery = async () => {
    addLog('正在查询数据库...');
    try {
      const res = await fetch('/api/test/db-query');
      const data = await res.json();
      setDbQueryResult(JSON.stringify(data, null, 2));
      const count = data.totalProducts?.length || 0;
      const septicCount = data.products?.length || 0;
      addLog(`✅ 查询成功，共 ${count} 个产品，其中 ${septicCount} 个化粪池`);
    } catch (error) {
      addLog(`❌ 查询失败: ${error}`);
      setDbQueryResult(`Error: ${error}`);
    }
  };

  const testDbSchema = async () => {
    addLog('正在查询数据库表结构...');
    try {
      const res = await fetch('/api/test/db-schema');
      const data = await res.json();
      setDbSchemaResult(JSON.stringify(data, null, 2));
      addLog(`✅ 查询成功，表包含 ${data.schema?.columns?.length || 0} 个字段`);
    } catch (error) {
      addLog(`❌ 查询失败: ${error}`);
      setDbSchemaResult(`Error: ${error}`);
    }
  };

  const testSimulateImport = async () => {
    setLoading(true);
    addLog('开始模拟导入流程...');
    try {
      const res = await fetch('/api/test/simulate-import', {
        method: 'POST',
      });
      const data = await res.json();
      setSimulateResult(JSON.stringify(data, null, 2));
      if (data.success) {
        addLog(
          `✅ 模拟导入成功！导入 ${data.imported} 条，重复 ${data.duplicated} 条，无效 ${data.invalid} 条`
        );
      } else {
        addLog(`❌ 模拟导入失败: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ 模拟导入失败: ${error}`);
      setSimulateResult(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const testInsertSeptic = async () => {
    setLoading(true);
    addLog('正在插入测试数据...');
    try {
      // 使用简化版插入 API，避免字段不匹配问题
      const res = await fetch('/api/test/simple-insert', {
        method: 'POST',
      });
      const data = await res.json();
      setInsertResult(JSON.stringify(data, null, 2));
      if (data.success) {
        addLog(`✅ 插入成功！当前数据库中有 ${data.verified?.length || 0} 个化粪池产品`);
        // 刷新数据库查询
        testDbQuery();
      } else {
        addLog(`❌ 插入失败: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ 插入失败: ${error}`);
      setInsertResult(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1400px', margin: '0 auto' }}
    >
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '10px', fontWeight: 'bold' }}>
          🔍 产品导入诊断工具
        </h1>
        <p style={{ color: '#666', fontSize: '16px' }}>用于诊断和测试产品价格库导入功能</p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <div
          style={{
            background: '#f8f9fa',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ fontSize: '20px', marginBottom: '15px', fontWeight: 'bold' }}>诊断操作</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              onClick={testDbQuery}
              style={{
                padding: '12px 24px',
                background: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              📊 查询数据库
            </button>
            <button
              onClick={testDbSchema}
              style={{
                padding: '12px 24px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              🔍 查看表结构
            </button>
            <button
              onClick={testSimulateImport}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: loading ? 0.5 : 1,
              }}
            >
              🧪 模拟导入流程
            </button>
            <button
              onClick={testInsertSeptic}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: loading ? 0.5 : 1,
              }}
            >
              ➕ 插入测试数据
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#fff3cd',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            border: '1px solid #ffeeba',
          }}
        >
          <h2 style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>诊断日志</h2>
          <div
            style={{
              background: '#fff',
              padding: '15px',
              borderRadius: '6px',
              height: '200px',
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '13px',
            }}
          >
            {logs.length === 0 ? (
              <p style={{ color: '#666' }}>等待操作...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px', color: '#333' }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {dbQueryResult && (
          <div
            style={{
              background: '#d4edda',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #c3e6cb',
            }}
          >
            <h2 style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
              📊 数据库查询结果
            </h2>
            <pre
              style={{
                background: '#fff',
                padding: '15px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '12px',
              }}
            >
              {dbQueryResult}
            </pre>
          </div>
        )}

        {dbSchemaResult && (
          <div
            style={{
              background: '#d1ecf1',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #bee5eb',
            }}
          >
            <h2 style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
              🔍 数据库表结构
            </h2>
            <pre
              style={{
                background: '#fff',
                padding: '15px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '12px',
              }}
            >
              {dbSchemaResult}
            </pre>
          </div>
        )}

        {simulateResult && (
          <div
            style={{
              background: '#d1ecf1',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #bee5eb',
            }}
          >
            <h2 style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
              🧪 模拟导入结果
            </h2>
            <pre
              style={{
                background: '#fff',
                padding: '15px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '12px',
              }}
            >
              {simulateResult}
            </pre>
          </div>
        )}

        {insertResult && (
          <div
            style={{
              background: '#d4edda',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #c3e6cb',
            }}
          >
            <h2 style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
              ➕ 插入测试数据结果
            </h2>
            <pre
              style={{
                background: '#fff',
                padding: '15px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '12px',
              }}
            >
              {insertResult}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
