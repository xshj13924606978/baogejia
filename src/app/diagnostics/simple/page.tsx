'use client';

import { useState } from 'react';

export default function ImportDiagnosticsSimple() {
  const [dbQueryResult, setDbQueryResult] = useState('');
  const [simulateResult, setSimulateResult] = useState('');
  const [loading, setLoading] = useState(false);

  const testDbQuery = async () => {
    try {
      const res = await fetch('/api/test/db-query');
      const data = await res.json();
      setDbQueryResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setDbQueryResult(`Error: ${error}`);
    }
  };

  const testSimulateImport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test/simulate-import', {
        method: 'POST',
      });
      const data = await res.json();
      setSimulateResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setSimulateResult(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>产品导入诊断工具</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>操作按钮</h2>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button
            onClick={testDbQuery}
            style={{
              padding: '10px 20px',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            查询数据库
          </button>
          <button
            onClick={testSimulateImport}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '导入中...' : '模拟导入'}
          </button>
        </div>
      </div>

      {dbQueryResult && (
        <div style={{ marginBottom: '20px' }}>
          <h2>数据库查询结果</h2>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '10px',
              borderRadius: '5px',
              overflow: 'auto',
              maxHeight: '400px',
            }}
          >
            {dbQueryResult}
          </pre>
        </div>
      )}

      {simulateResult && (
        <div style={{ marginBottom: '20px' }}>
          <h2>模拟导入结果</h2>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '10px',
              borderRadius: '5px',
              overflow: 'auto',
              maxHeight: '400px',
            }}
          >
            {simulateResult}
          </pre>
        </div>
      )}
    </div>
  );
}
