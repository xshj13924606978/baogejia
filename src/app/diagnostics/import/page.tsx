'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ImportDiagnostics() {
  const [dbQueryResult, setDbQueryResult] = useState<any>(null);
  const [dbSchemaResult, setDbSchemaResult] = useState<any>(null);
  const [simulateImportResult, setSimulateImportResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const loadDbQuery = async () => {
    addLog('正在查询数据库...');
    try {
      const res = await fetch('/api/test/db-query');
      const data = await res.json();
      setDbQueryResult(data);
      addLog(`✅ 查询成功，共 ${data.totalProducts?.length || 0} 个产品，其中 ${data.products?.length || 0} 个化粪池`);
    } catch (error) {
      addLog(`❌ 查询失败: ${error}`);
    }
  };

  const loadDbSchema = async () => {
    addLog('正在查询数据库表结构...');
    try {
      const res = await fetch('/api/test/db-schema');
      const data = await res.json();
      setDbSchemaResult(data);
      addLog(`✅ 查询成功，表包含 ${data.schema?.columns?.length || 0} 个字段`);
    } catch (error) {
      addLog(`❌ 查询失败: ${error}`);
    }
  };

  const simulateImport = async () => {
    setLoading(true);
    addLog('开始模拟导入流程...');
    try {
      const res = await fetch('/api/test/simulate-import', {
        method: 'POST'
      });
      const data = await res.json();
      setSimulateImportResult(data);
      
      if (data.success) {
        addLog(`✅ 模拟导入成功！导入 ${data.imported} 条，重复 ${data.duplicated} 条，无效 ${data.invalid} 条`);
      } else {
        addLog(`❌ 模拟导入失败: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ 模拟导入失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const insertTestSeptic = async () => {
    setLoading(true);
    addLog('正在插入测试数据...');
    try {
      const res = await fetch('/api/test/insert-septic', {
        method: 'POST'
      });
      const data = await res.json();
      
      if (data.success) {
        addLog(`✅ 插入成功！当前数据库中有 ${data.verified?.totalSeptic || 0} 个化粪池产品`);
        // 刷新数据库查询
        await loadDbQuery();
      } else {
        addLog(`❌ 插入失败: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ 插入失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    addLog('页面加载完成，开始诊断...');
    loadDbQuery();
    loadDbSchema();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">产品导入诊断工具</h1>
        <p className="text-muted-foreground">
          用于诊断和测试产品价格库导入功能
        </p>
      </div>

      <div className="grid gap-6 mb-8">
        {/* 操作面板 */}
        <Card>
          <CardHeader>
            <CardTitle>诊断操作</CardTitle>
            <CardDescription>执行以下操作来诊断导入问题</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <Button onClick={loadDbQuery} variant="outline">
                📊 查询数据库
              </Button>
              <Button onClick={loadDbSchema} variant="outline">
                🔍 查看表结构
              </Button>
              <Button onClick={simulateImport} disabled={loading} variant="default">
                🧪 模拟导入流程
              </Button>
              <Button onClick={insertTestSeptic} disabled={loading} variant="secondary">
                ➕ 插入测试数据
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 诊断日志 */}
        <Card>
          <CardHeader>
            <CardTitle>诊断日志</CardTitle>
            <CardDescription>实时显示诊断过程中的信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md h-64 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">等待操作...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 详细信息标签页 */}
      <Tabs defaultValue="db-query" className="w-full">
        <TabsList>
          <TabsTrigger value="db-query">数据库查询</TabsTrigger>
          <TabsTrigger value="db-schema">表结构</TabsTrigger>
          <TabsTrigger value="simulate-import">模拟导入</TabsTrigger>
        </TabsList>

        {/* 数据库查询结果 */}
        <TabsContent value="db-query" className="space-y-4">
          {dbQueryResult ? (
            <>
              <Alert>
                <AlertTitle>查询结果</AlertTitle>
                <AlertDescription>
                  {dbQueryResult.message}
                </AlertDescription>
              </Alert>
              
              <div className="grid gap-4 md:grid-cols-2">
                {/* 化粪池产品 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      化粪池产品
                      <Badge variant={dbQueryResult.products?.length > 0 ? "default" : "destructive"}>
                        {dbQueryResult.products?.length || 0}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dbQueryResult.products && dbQueryResult.products.length > 0 ? (
                      <div className="space-y-2">
                        {dbQueryResult.products.map((p: any, i: number) => (
                          <div key={i} className="text-sm p-2 bg-muted rounded">
                            <div><strong>名称:</strong> {p.name}</div>
                            <div><strong>型号:</strong> {p.model} ({p.modelType})</div>
                            <div><strong>价格:</strong> ¥{p.price}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        ⚠️ 数据库中没有化粪池产品数据
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* 所有产品 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      所有产品
                      <Badge>{dbQueryResult.totalProducts?.length || 0}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dbQueryResult.totalProducts && dbQueryResult.totalProducts.length > 0 ? (
                      <div className="space-y-2">
                        {dbQueryResult.totalProducts.map((p: any, i: number) => (
                          <div key={i} className="text-sm p-2 bg-muted rounded">
                            <div><strong>名称:</strong> {p.name}</div>
                            <div><strong>型号:</strong> {p.model}</div>
                            <div><strong>价格:</strong> ¥{p.price}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        数据库为空
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 测试结果 */}
              {dbQueryResult.testResults && (
                <Card>
                  <CardHeader>
                    <CardTitle>精确匹配测试</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dbQueryResult.testResults.map((test: any, i: number) => (
                        <div key={i} className="text-sm p-2 bg-muted rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span>
                              name="{test.testCase.name}" model="{test.testCase.model}" ({test.testCase.modelType})
                            </span>
                            <Badge variant={test.matchCount > 0 ? "default" : "destructive"}>
                              {test.matchCount} 匹配
                            </Badge>
                          </div>
                          {test.matches && test.matches.length > 0 && (
                            <div className="pl-4 space-y-1">
                              {test.matches.map((m: any, j: number) => (
                                <div key={j} className="text-xs">
                                  - {m.name} | {m.model} ({m.modelType}) | ¥{m.price}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">点击"查询数据库"按钮查看结果</p>
          )}
        </TabsContent>

        {/* 表结构 */}
        <TabsContent value="db-schema" className="space-y-4">
          {dbSchemaResult ? (
            <Card>
              <CardHeader>
                <CardTitle>products 表结构</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dbSchemaResult.schema?.columns?.map((col: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 text-sm p-2 bg-muted rounded">
                      <Badge variant="outline">{col.name}</Badge>
                      <span className="text-muted-foreground">{col.type}</span>
                      <span className="text-muted-foreground">{col.sample}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-muted-foreground">点击"查看表结构"按钮查看结果</p>
          )}
        </TabsContent>

        {/* 模拟导入 */}
        <TabsContent value="simulate-import" className="space-y-4">
          {simulateImportResult ? (
            <>
              <Alert>
                <AlertTitle>模拟导入结果</AlertTitle>
                <AlertDescription>
                  {simulateImportResult.message}
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      导入成功
                      <Badge variant="default">{simulateImportResult.imported || 0}</Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      重复产品
                      <Badge variant="secondary">{simulateImportResult.duplicated || 0}</Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      无效数据
                      <Badge variant="destructive">{simulateImportResult.invalid || 0}</Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {simulateImportResult.insertedData && simulateImportResult.insertedData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>成功插入的产品</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {simulateImportResult.insertedData.map((p: any, i: number) => (
                        <div key={i} className="text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded">
                          <div><strong>ID:</strong> {p.id}</div>
                          <div><strong>名称:</strong> {p.name}</div>
                          <div><strong>型号:</strong> {p.model}</div>
                          <div><strong>价格:</strong> ¥{p.price}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {simulateImportResult.duplicateData && simulateImportResult.duplicateData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>重复的产品</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {simulateImportResult.duplicateData.map((d: any, i: number) => (
                        <div key={i} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                          <div><strong>已存在:</strong> {d.existing.name} | {d.existing.model} | ¥{d.existing.price}</div>
                          <div><strong>尝试插入:</strong> {d.attempted.name} | {d.attempted.model} | ¥{d.attempted.price}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {simulateImportResult.verified && (
                <Card>
                  <CardHeader>
                    <CardTitle>数据库验证</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-2">当前数据库中有 <strong>{simulateImportResult.verified.totalSeptic}</strong> 个化粪池产品</p>
                    <div className="space-y-2">
                      {simulateImportResult.verified.products.map((p: any, i: number) => (
                        <div key={i} className="text-sm p-2 bg-muted rounded">
                          <span>{p.name} | {p.model} | ¥{p.price}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">点击"模拟导入流程"按钮查看结果</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
