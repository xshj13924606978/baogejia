'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Package, Edit2, RotateCcw, Trash2, X, Check, Plus, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CategoryNode, defaultCategoryTree } from '@/data/product-categories';

interface CategoryTreeProps {
  products?: any[];
  onCategorySelect?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
}

export function CategoryTree({
  products = [],
  onCategorySelect,
  selectedCategoryId = null,
}: CategoryTreeProps) {
  const [tree, setTree] = useState<CategoryNode>(JSON.parse(JSON.stringify(defaultCategoryTree)));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['root']));
  const [isEditing, setIsEditing] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeName, setEditingNodeName] = useState('');
  const [addingNodeId, setAddingNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState('');
  const [mergingNodeId, setMergingNodeId] = useState<string | null>(null);

  // 统计每个分类的产品数量
  const countProducts = (node: CategoryNode): number => {
    let count = 0;

    // 统计直接属于该分类的产品
    if (products && products.length > 0) {
      count = products.filter(p => p.category === node.code).length;
    }

    // 统计子分类的产品
    if (node.children) {
      for (const child of node.children) {
        count += countProducts(child);
      }
    }

    node.count = count;
    return count;
  };

  // 计算所有分类的产品数量
  const treeWithCounts = JSON.parse(JSON.stringify(tree));
  countProducts(treeWithCounts);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleCategoryClick = (id: string) => {
    // 如果点击的是当前已选择的分类，则取消选择
    if (selectedCategoryId === id) {
      onCategorySelect?.(null);
    } else {
      onCategorySelect?.(id);
    }

    // 同时展开该分类的父节点
    expandParents(treeWithCounts, id);
  };

  const expandParents = (node: CategoryNode, targetId: string, parentIds: string[] = []): boolean => {
    if (node.id === targetId) {
      // 展开所有父节点
      const newExpanded = new Set(expandedIds);
      parentIds.forEach(id => newExpanded.add(id));
      setExpandedIds(newExpanded);
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (expandParents(child, targetId, [...parentIds, node.id])) {
          return true;
        }
      }
    }

    return false;
  };

  const handleResetToDefault = () => {
    if (confirm('确定要恢复默认分类吗？这将重置所有自定义修改。')) {
      const defaultTree = JSON.parse(JSON.stringify(defaultCategoryTree));
      setTree(defaultTree);
      localStorage.removeItem('product-categories-custom');
      alert('✅ 已恢复默认分类');
    }
  };

  const handleSaveCustom = () => {
    localStorage.setItem('product-categories-custom', JSON.stringify(tree));
    alert('✅ 自定义分类已保存');
  };

  // 开始编辑节点
  const startEditNode = (nodeId: string, nodeName: string) => {
    setEditingNodeId(nodeId);
    setEditingNodeName(nodeName);
  };

  // 保存节点编辑
  const saveNodeEdit = () => {
    if (!editingNodeId || !editingNodeName.trim()) {
      alert('分类名称不能为空');
      return;
    }

    const updateNodeName = (node: CategoryNode): boolean => {
      if (node.id === editingNodeId) {
        node.name = editingNodeName.trim();
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (updateNodeName(child)) return true;
        }
      }
      return false;
    };

    const newTree = JSON.parse(JSON.stringify(tree));
    updateNodeName(newTree);
    setTree(newTree);
    setEditingNodeId(null);
    setEditingNodeName('');
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingNodeId(null);
    setEditingNodeName('');
  };

  // 删除节点
  const handleDeleteNode = (nodeId: string) => {
    // 不能删除根节点
    if (nodeId === 'root') {
      alert('根节点不能删除');
      return;
    }

    if (!confirm('确定要删除此分类及其所有子分类吗？此操作不可撤销。')) {
      return;
    }

    const deleteNode = (node: CategoryNode): CategoryNode | null => {
      if (!node.children) return node;

      const newChildren = node.children
        .map(child => {
          if (child.id === nodeId) {
            return null;
          }
          return deleteNode(child);
        })
        .filter((child): child is CategoryNode => child !== null);

      return { ...node, children: newChildren };
    };

    const newTree = deleteNode(tree);
    if (newTree) {
      setTree(newTree);
      // 如果删除的是当前选中的分类，取消选择
      if (selectedCategoryId === nodeId) {
        onCategorySelect?.(null);
      }
    }
  };

  // 新增子分类
  const startAddNode = (nodeId: string) => {
    setAddingNodeId(nodeId);
    setNewNodeName('');
  };

  const saveNewNode = () => {
    if (!addingNodeId || !newNodeName.trim()) {
      alert('分类名称不能为空');
      return;
    }

    const addChild = (node: CategoryNode): boolean => {
      if (node.id === addingNodeId) {
        if (!node.children) {
          node.children = [];
        }
        // 生成新的子节点ID和code
        const newId = `${node.id}-${node.children.length + 1}`;
        const newCode = `${node.code}-${String(node.children.length + 1).padStart(2, '0')}`;
        node.children.push({
          id: newId,
          name: newNodeName.trim(),
          code: newCode,
        });
        // 自动展开父节点
        const newExpanded = new Set(expandedIds);
        newExpanded.add(addingNodeId);
        setExpandedIds(newExpanded);
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (addChild(child)) return true;
        }
      }
      return false;
    };

    const newTree = JSON.parse(JSON.stringify(tree));
    addChild(newTree);
    setTree(newTree);
    setAddingNodeId(null);
    setNewNodeName('');
  };

  const cancelAddNode = () => {
    setAddingNodeId(null);
    setNewNodeName('');
  };

  // 合并同级分类
  const handleMergeSiblings = (nodeId: string) => {
    const siblings: CategoryNode[] = [];
    let parentCode = '';
    let parentChildren: CategoryNode[] = [];

    // 找到该节点的所有同级节点
    const findSiblings = (node: CategoryNode, targetId: string, currentChildren?: CategoryNode[]): boolean => {
      if (node.children) {
        const found = node.children.find(child => child.id === targetId);
        if (found) {
          siblings.push(...node.children);
          parentCode = node.code;
          parentChildren = node.children;
          return true;
        }
        for (const child of node.children) {
          if (findSiblings(child, targetId, node.children)) return true;
        }
      }
      return false;
    };

    findSiblings(tree, nodeId);

    if (siblings.length < 2) {
      alert('至少需要两个同级分类才能合并');
      return;
    }

    if (!confirm(`确定要将这 ${siblings.length} 个同级分类合并吗？此操作不可撤销。`)) {
      return;
    }

    const mergedName = siblings.map(s => s.name).join('+');
    const mergedCode = `${parentCode}-merged`;

    // 找到父节点并替换子节点
    const replaceWithMerged = (node: CategoryNode): boolean => {
      if (node.code === parentCode && node.children) {
        // 创建合并后的节点
        const mergedNode: CategoryNode = {
          id: `${node.id}-merged`,
          name: mergedName,
          code: mergedCode,
          children: siblings.reduce((acc, s) => [...acc, ...(s.children || [])], [] as CategoryNode[]),
        };
        // 替换为合并后的节点
        node.children = [mergedNode];
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (replaceWithMerged(child)) return true;
        }
      }
      return false;
    };

    const newTree = JSON.parse(JSON.stringify(tree));
    replaceWithMerged(newTree);
    setTree(newTree);
  };

  // 合并下级分类
  const handleMergeChildren = (nodeId: string) => {
    const findNode = (node: CategoryNode, targetId: string): CategoryNode | null => {
      if (node.id === targetId) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = findNode(child, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    const targetNode = findNode(tree, nodeId);

    if (!targetNode || !targetNode.children || targetNode.children.length < 2) {
      alert('该分类至少需要两个子分类才能合并');
      return;
    }

    if (!confirm(`确定要将 "${targetNode.name}" 的所有子分类合并到该分类吗？此操作不可撤销。`)) {
      return;
    }

    const updateNode = (node: CategoryNode): boolean => {
      if (node.id === nodeId) {
        // 将所有子分类的子节点提升到当前节点
        const grandchildren = node.children!.reduce((acc, child) => [...acc, ...(child.children || [])], [] as CategoryNode[]);
        node.children = grandchildren;
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (updateNode(child)) return true;
        }
      }
      return false;
    };

    const newTree = JSON.parse(JSON.stringify(tree));
    updateNode(newTree);
    setTree(newTree);
  };

  // 加载自定义分类
  React.useEffect(() => {
    const customTree = localStorage.getItem('product-categories-custom');
    if (customTree) {
      try {
        setTree(JSON.parse(customTree));
      } catch (e) {
        console.error('加载自定义分类失败:', e);
      }
    }
  }, []);

  const renderNode = (node: CategoryNode, level: number = 0, hasSiblings: boolean = false): React.ReactNode => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedCategoryId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const totalCount = node.count || 0;
    const isEditingThisNode = editingNodeId === node.id;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (!isEditingThisNode && !isEditing) {
              handleCategoryClick(node.id);
            }
          }}
        >
          {hasChildren ? (
            <button
              className="w-5 h-5 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-5"></span>
          )}

          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 text-blue-500" />
            )
          ) : (
            <Package className="w-4 h-4 text-slate-400" />
          )}

          {isEditingThisNode ? (
            <Input
              value={editingNodeName}
              onChange={(e) => setEditingNodeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveNodeEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-7 text-sm px-2 py-1"
              autoFocus
            />
          ) : (
            <span className="text-sm flex-1">{node.name}</span>
          )}

          {totalCount > 0 && !isEditingThisNode && (
            <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
              {totalCount}
            </span>
          )}

          {node.code && !isEditingThisNode && (
            <span className="text-xs text-slate-400 dark:text-slate-600">
              {node.code}
            </span>
          )}

          {isEditing && !isEditingThisNode && (
            <div className="flex items-center gap-1 ml-1">
              <button
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditNode(node.id, node.name);
                }}
                title="编辑"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-slate-500 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400"
                onClick={(e) => {
                  e.stopPropagation();
                  startAddNode(node.id);
                }}
                title="新增子分类"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {hasSiblings && (
                <button
                  className="w-6 h-6 flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMergeSiblings(node.id);
                  }}
                  title="合并同级"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                </button>
              )}
              {hasChildren && node.children && node.children.length >= 2 && (
                <button
                  className="w-6 h-6 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMergeChildren(node.id);
                  }}
                  title="合并下级"
                >
                  <GitMerge className="w-3.5 h-3.5 rotate-180" />
                </button>
              )}
              <button
                className="w-6 h-6 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteNode(node.id);
                }}
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isEditingThisNode && (
            <div className="flex items-center gap-1 ml-1">
              <button
                className="w-6 h-6 flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 dark:text-green-400"
                onClick={(e) => {
                  e.stopPropagation();
                  saveNodeEdit();
                }}
                title="保存"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelEdit();
                }}
                title="取消"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 新增子分类输入框 */}
        {addingNodeId === node.id && (
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 ml-4"
            style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="w-4 h-4 text-blue-500" />
            <Input
              value={newNodeName}
              onChange={(e) => setNewNodeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveNewNode();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelAddNode();
                }
              }}
              placeholder="输入新分类名称"
              className="flex-1 h-7 text-sm px-2 py-1"
              autoFocus
            />
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 dark:text-green-400"
              onClick={(e) => {
                e.stopPropagation();
                saveNewNode();
              }}
              title="保存"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400"
              onClick={(e) => {
                e.stopPropagation();
                cancelAddNode();
              }}
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child, index) => 
              renderNode(child, level + 1, node.children!.length > 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <div className="flex items-center justify-between mb-3 px-2 shrink-0">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">产品分类</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? '完成编辑' : '编辑分类'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResetToDefault}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              恢复默认
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSaveCustom}>
              保存自定义
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-y-auto px-1" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {renderNode(treeWithCounts)}
      </div>

      {selectedCategoryId && (
        <div className="mt-2 px-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs h-7"
            onClick={() => onCategorySelect?.(null)}
          >
            清除筛选
          </Button>
        </div>
      )}
    </div>
  );
}
