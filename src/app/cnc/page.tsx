import CNCAnalyzer from '@/components/CNCAnalyzer';

export const metadata = {
  title: 'OpenClaw CNC 分析报价',
  description: '上传图纸/模型文件进行尺寸分析，并生成 CNC 加工报价',
};

export default function CNCPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">OpenClaw CNC</h1>
          <p className="text-gray-500">图纸分析 · 加工报价</p>
        </div>
        <CNCAnalyzer />
      </div>
    </div>
  );
}
