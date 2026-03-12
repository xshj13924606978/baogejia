'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SwitchContextType {
  fileGroupId: string | null;
  files: any[];
  currentChoice: string | null;
  isLoading: boolean;
  hasFiles: boolean;
  setActiveGroup: (groupId: string, files: any[], choice: string) => void;
  setChoice: (choice: string) => void;
  setLoading: (loading: boolean) => void;
  generatedChoice: string | null;
  setGeneratedChoice: (choice: string | null) => void;
  resetSwitch: () => void;
}

const SwitchContext = createContext<SwitchContextType | undefined>(undefined);

export function SwitchProvider({ children }: { children: ReactNode }) {
  const [fileGroupId, setFileGroupId] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [currentChoice, setCurrentChoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasFiles, setHasFiles] = useState<boolean>(false);
  const [generatedChoice, setGeneratedChoice] = useState<string | null>(null);

  const setActiveGroup = (groupId: string, files: any[], choice: string) => {
    console.log('[SwitchContext] 设置活跃组:', groupId, '文件数:', files?.length, '选择:', choice);
    setFileGroupId(groupId);
    setFiles(files || []);
    setCurrentChoice(choice);
    setHasFiles(!!files && files.length > 0);
  };

  const setChoice = (choice: string) => {
    console.log('[SwitchContext] 设置选择:', choice);
    setCurrentChoice(choice);
  };

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  const resetSwitch = () => {
    console.log('[SwitchContext] 重置所有状态');
    setFileGroupId(null);
    setFiles([]);
    setCurrentChoice(null);
    setIsLoading(false);
    setHasFiles(false);
    setGeneratedChoice(null);
  };

  return (
    <SwitchContext.Provider
      value={{
        fileGroupId,
        files,
        currentChoice,
        isLoading,
        hasFiles,
        setActiveGroup,
        setChoice,
        setLoading,
        generatedChoice,
        setGeneratedChoice,
        resetSwitch,
      }}
    >
      {children}
    </SwitchContext.Provider>
  );
}

export function useSwitch() {
  const context = useContext(SwitchContext);
  if (context === undefined) {
    throw new Error('useSwitch must be used within a SwitchProvider');
  }
  return context;
}
