'use client';

import { useState, useRef } from 'react';
import { Camera, X, Upload, Loader2, ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CameraInputProps {
  onImageCaptured: (file: File) => void;
  disabled?: boolean;
}

export function CameraInput({ onImageCaptured, disabled }: CameraInputProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const openFilePicker = (capture?: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onImageCaptured(file);
    };
    input.click();
  };

  const openCamera = async () => {
    // 不支持 getUserMedia（非 HTTPS / 受限 WebView）时直接调起系统相机
    if (!navigator.mediaDevices?.getUserMedia) {
      openFilePicker(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      // 等 DOM 渲染后设置 srcObject
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
      setShowCamera(true);
    } catch (error) {
      // 权限被拒或无摄像头时回退到系统相机 / 文件选择
      console.error('打开摄像头失败，回退到系统相机:', error);
      openFilePicker(true);
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onImageCaptured(file);
      }
    }, 'image/jpeg', 0.9);
    closeCamera();
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || isAnalyzing}
            className="h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-50 flex items-center justify-center"
            title="拍照/选择图片"
          >
            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[150px]">
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              openCamera();
            }}
          >
            <Camera className="h-4 w-4" />
            拍照
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              openFilePicker();
            }}
          >
            <ImageIcon className="h-4 w-4" />
            选择图片
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCamera} onOpenChange={(open) => { if (!open) closeCamera(); }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 bg-black border-none">
          <DialogTitle className="sr-only">拍照</DialogTitle>
          <div className="relative">
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-6">
              <button
                onClick={closeCamera}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <X size={20} />
              </button>
              <button
                onClick={takePhoto}
                className="w-14 h-14 rounded-full bg-white border-4 border-slate-300 hover:border-white transition-colors"
              />
              <button
                onClick={() => { closeCamera(); openFilePicker(); }}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <Upload size={20} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
