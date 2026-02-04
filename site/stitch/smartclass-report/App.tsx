
import React, { useState } from 'react';
import InputForm from './components/InputForm';
import ReportPreview from './components/ReportPreview';
import { ReportConfig, ImageData, GeneratedContent, GenerationStatus } from './types';
import { generateReportText } from './services/geminiService';
import { generateAndDownloadDocx, editAndDownloadDocx } from './services/docxService';
import { generateAndDownloadExcel } from './services/excelService';
import { parseTemplateFile } from './services/fileParsingService';
import { PenTool, LayoutTemplate } from 'lucide-react';

const App: React.FC = () => {
  const [config, setConfig] = useState<ReportConfig>({
    mode: 'report', 
    topic: '', 
    names: '', 
    description: '', 
    tone: 'inspiring', 
    preferredFont: 'kaiti',
    templateFile: null
  });
  const [images, setImages] = useState<ImageData[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);

  const handleGenerate = async () => {
    setStatus(GenerationStatus.GENERATING);
    try {
      let context = '';
      if (config.mode === 'template' && config.templateFile) {
        const parsed = await parseTemplateFile(config.templateFile);
        context = parsed.text;
      }
      const result = await generateReportText(config, images.length, context);
      setGeneratedContent(result);
      setStatus(GenerationStatus.SUCCESS);
    } catch (error: any) {
      console.error(error);
      setStatus(GenerationStatus.ERROR);
      alert(error.message || "生成失败，请检查网络或配置。");
    }
  };

  const handleDownloadDocx = async () => {
    if (!generatedContent) return;
    try {
      if (config.mode === 'template' && config.templateFile && generatedContent.replacements) {
        await editAndDownloadDocx(config.templateFile, generatedContent.replacements, config.templateFile.name);
      } else {
        await generateAndDownloadDocx(generatedContent, images, config.topic);
      }
    } catch (error) {
      alert("下载失败: " + error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <nav className="bg-indigo-700 text-white shadow-md p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-white/10 p-2 rounded-lg">
              {config.mode === 'report' ? <PenTool size={24} /> : <LayoutTemplate size={24} />}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">智绘班会 (EduScribe Pro)</h1>
              <p className="text-xs text-indigo-200">
                {config.mode === 'report' ? '智能深度成文助手' : '原格式模版填充专家'}
              </p>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
             <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md mb-6">
                <p className="text-sm text-blue-800">
                  {config.mode === 'report' 
                    ? "✨ 全新模式：只需输入活动简述，AI 自动构思章节并完成长篇润色。" 
                    : "🔒 格式保护：模版模式下将 100% 保留您的表格、字体和布局。"}
                </p>
              </div>
            <InputForm
              config={config} setConfig={setConfig}
              images={images} setImages={setImages}
              onSubmit={handleGenerate} isGenerating={status === GenerationStatus.GENERATING}
            />
          </div>
          <div className="lg:col-span-8">
            <ReportPreview
              content={generatedContent} images={images}
              onDownloadDocx={handleDownloadDocx}
              onDownloadExcel={() => generateAndDownloadExcel(generatedContent!, config.topic)}
              mode={config.mode}
            />
          </div>
        </div>
      </main>
      <footer className="py-4 text-center text-slate-400 text-xs border-t bg-white">
        智绘班会 - 您的教育 AI 创作伴侣
      </footer>
    </div>
  );
};

export default App;
