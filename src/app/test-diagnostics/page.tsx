'use client';

export default function TestDiagnosticsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">测试诊断页面</h1>
      <p>如果你能看到这个页面，说明路由正常工作！</p>

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-2">测试按钮</h2>
        <button
          onClick={() =>
            fetch('/api/test/db-query')
              .then((r) => r.json())
              .then(console.log)
          }
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          测试数据库查询 API
        </button>
      </div>
    </div>
  );
}
