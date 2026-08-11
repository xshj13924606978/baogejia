'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  'network': '语音识别网络不可用，请尝试使用 Edge 浏览器或检查防火墙/VPN 设置',
  'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
  'no-speech': '',
  'aborted': '',
  'audio-capture': '未检测到麦克风设备，请确认已连接麦克风',
  'service-not-allowed': '语音识别服务不可用',
};

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef<any>(null);
  const errorTimerRef = useRef<any>(null);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(''), 3000);
  }, []);

  const startListening = async () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      showError('浏览器不支持语音输入，请使用 Chrome 或 Edge');
      return;
    }

    // 先显式请求麦克风权限，避免浏览器将权限问题误报为 network 错误
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showError('未检测到麦克风设备，请确认已连接麦克风');
      } else {
        showError('无法访问麦克风，请检查设备连接');
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'zh-CN';

    recognition.onstart = () => {
      setIsListening(true);
      setIsProcessing(false);
      setErrorMsg('');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      const errMsg = ERROR_MESSAGES[event.error];
      if (errMsg) {
        console.warn('[VoiceInput] 语音识别错误:', event.error);
        showError(errMsg);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setIsProcessing(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsProcessing(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setIsProcessing(false);
  };

  return (
    <button
      type="button"
      onClick={isListening ? stopListening : () => startListening()}
      disabled={disabled}
      className={`relative h-9 w-9 rounded-full transition-all duration-200 flex items-center justify-center ${
        isListening
          ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
      }`}
      title={isListening ? '停止录音' : '语音输入'}
    >
      {isProcessing && !isListening ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      {errorMsg && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50">
          {errorMsg}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </button>
  );
}
