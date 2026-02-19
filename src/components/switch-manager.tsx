'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SwitchContextType {
  fileGroupId: string | null;
  files: any[];
  currentChoice: string;
  generatedChoice: string; // 追踪已生成的内容类型
  isLoading: boolean;
  setActiveGroup: (fileGroupId: string, files: any[], choice: string) => void;
  setLoading: (loading: boolean) => void;
  setChoice: (choice: string) => void;
  setGeneratedChoice: (choice: string) => void; // 新增：设置已生成的内容类型
  clearActiveGroup: () => void;
}

const SwitchContext = createContext<SwitchContextType | undefined>(undefined);

export function SwitchProvider({ children }: { children: ReactNode }) {
  const [fileGroupId, setFileGroupId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [currentChoice, setCurrentChoice] = useState<string>('quote');
  const [generatedChoice, setGeneratedChoice] = useState<string>(''); // 追踪已生成的内容类型
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setActiveGroup = useCallback((id: string, f: any[], choice: string) => {
    setFileGroupId(id);
    setFiles(f);
    setCurrentChoice(choice);
    setGeneratedChoice(''); // 切换文件组时重置已生成的内容类型
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const setChoice = useCallback((choice: string) => {
    setCurrentChoice(choice);
  }, []);

  const clearActiveGroup = useCallback(() => {
    setFileGroupId(null);
    setFiles([]);
    setCurrentChoice('quote');
    setGeneratedChoice(''); // 重置已生成的内容类型
    setIsLoading(false);
  }, []);

  return (
    <SwitchContext.Provider
      value={{
        fileGroupId,
        files,
        currentChoice,
        generatedChoice,
        isLoading,
        setActiveGroup,
        setLoading,
        setChoice,
        setGeneratedChoice,
        clearActiveGroup,
      }}
    >
      {children}
    </SwitchContext.Provider>
  );
}

export function useSwitch() {
  const context = useContext(SwitchContext);
  if (!context) {
    throw new Error('useSwitch must be used within SwitchProvider');
  }
  return context;
}

