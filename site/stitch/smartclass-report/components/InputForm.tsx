
import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, FileSpreadsheet, FileText, Sparkles, MessageSquareQuote } from 'lucide-react';
import { ReportConfig, ImageData, AppMode } from '../types';

interface InputFormProps {
  config: ReportConfig;
  setConfig: React.Dispatch<React.SetStateAction<ReportConfig>>;
  images: ImageData[];
  setImages: React.Dispatch<React.SetStateAction<ImageData[]>>;
  onSubmit: () => void;
  isGenerating: boolean;
}

const InputForm: React.FC<InputFormProps> = ({
  config,
  setConfig,
  images,
  setImages,
  onSubmit,
  isGenerating,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleModeChange = (mode: AppMode) => {
    setConfig(prev => ({ ...prev, mode }));
  };

  const processFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const img = new Image();
          img.onload = () => {
            setImages((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substr(2, 9),
                file,
                previewUrl: URL.createObjectURL(file),
                base64: event.target!.result as string,
                aspectRatio: img.width / img.height,
              },
            ]);
          };
          img.src = event.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setConfig(prev => ({ ...prev, templateFile: e.target.files![0] }));
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden sticky top-24">
      <div className="flex border-b border-slate-100 bg-slate-50/50">
        <button
          onClick={() => handleModeChange('report')}
          className={`flex-1 py-4 text-sm font-bold flex items-center justify-center space-x-2 transition-all
            ${config.mode === 'report' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}
        >
          <FileText size={18} />
          <span>深度报告模式</span>
        </button>
        <button
          onClick={() => handleModeChange('template')}
          className={`flex-1 py-4 text-sm font-bold flex items-center justify-center space-x-2 transition-all
            ${config.mode === 'template' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}
        >
          <FileSpreadsheet size={18} />
          <span>公文填充模式</span>
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center">
               <Sparkles size={14} className="mr-1 text-indigo-500" />
              {config.mode === 'report' ? '报告总标题' : '目标文件名'}
            </label>
            <input
              type="text"
              name="topic"
              value={config.topic}
              onChange={handleInputChange}
              placeholder={config.mode === 'report' ? "例如：'点燃理想之火'主题班会纪实" : "例如：XX小学月度工作报告"}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">文风与情感</label>
              <select
                name="tone"
                value={config.tone}
                onChange={handleInputChange}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 bg-white text-sm outline-none"
              >
                <option value="formal">严谨官方 (适合提交学校)</option>
                <option value="emotional">感人至深 (适合家校互动)</option>
                <option value="inspiring">激昂澎湃 (适合表彰宣传)</option>
                <option value="relaxed">清新自然 (适合班级纪实)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">预览字体</label>
              <select
                name="preferredFont"
                value={config.preferredFont}
                onChange={handleInputChange}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 bg-white text-sm outline-none"
              >
                <option value="kaiti">楷体 (极具人文情怀)</option>
                <option value="songti">宋体 (标准报告公文)</option>
                <option value="heiti">黑体 (现代专业报告)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-bold text-slate-700 flex items-center space-x-1">
                <MessageSquareQuote size={14} className="text-indigo-500" />
                <span>活动纪实与感悟素材 (AI 扩写基础)</span>
              </label>
            </div>
            <textarea
              name="description"
              value={config.description}
              onChange={handleInputChange}
              rows={8}
              placeholder="请输入本次班会/活动的初稿。AI 将以此为核心自动构思 2000 字左右的长篇文章。
您可以输入：
1. 活动的具体流程和突发的小插曲
2. 某个学生让你感动的瞬间或发言
3. 你作为班主任在此时此刻的教育反思..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none text-sm leading-relaxed outline-none"
            />
            <div className="bg-indigo-50 p-3 rounded-lg mt-2">
               <p className="text-[11px] text-indigo-700 leading-normal">
                <b>💡 专家提示：</b> 您的描述越感性，AI 生成的文章就越有温度。无需担心格式，AI 会自动为您分章排版。
              </p>
            </div>
          </div>
        </div>

        {config.mode === 'template' ? (
           <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 border-dashed">
             <label className="block text-sm font-bold text-slate-700 mb-3">上传模版示范文件 (.docx / .xlsx)</label>
             <div 
               onClick={() => templateInputRef.current?.click()}
               className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
             >
               {config.templateFile ? (
                 <>
                   <div className="bg-indigo-100 p-3 rounded-full mb-3 text-indigo-600">
                     <FileText size={32} />
                   </div>
                   <span className="text-sm font-semibold text-slate-700 truncate max-w-full px-2">{config.templateFile.name}</span>
                   <span className="text-[10px] text-slate-400 mt-1">点击可更换文件</span>
                 </>
               ) : (
                 <>
                   <Upload size={32} className="text-slate-300 mb-3 group-hover:text-indigo-400 transition-colors" />
                   <span className="text-sm text-slate-500 font-medium">点击上传 Word/Excel 模版</span>
                   <span className="text-[10px] text-slate-400 mt-1">系统将 100% 还原原模版样式</span>
                 </>
               )}
             </div>
             <input type="file" ref={templateInputRef} onChange={handleTemplateUpload} accept=".docx,.xlsx,.xls" className="hidden" />
           </div>
        ) : (
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2.5">现场活动照片 (AI 智能图文匹配)</label>
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`grid grid-cols-4 gap-2.5 p-1 rounded-xl transition-all ${dragActive ? 'bg-indigo-50 scale-[1.02]' : ''}`}
            >
              {images.map((img, index) => (
                <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                  <img src={img.previewUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-1">
                    <span className="text-white font-bold text-[9px] bg-indigo-600/80 px-2 py-0.5 rounded-full">{index === 0 ? '封面' : `插图 ${index}`}</span>
                    <button onClick={() => removeImage(img.id)} className="bg-white/20 hover:bg-red-500 text-white p-1 rounded-full transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-all bg-slate-50/50 hover:bg-white shadow-sm"
              >
                <Upload size={20} className="mb-1" />
                <span className="text-[10px] font-medium">添加照片</span>
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} multiple accept="image/*" className="hidden" />
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={isGenerating || !config.topic}
          className={`w-full py-4 px-4 rounded-2xl flex items-center justify-center space-x-3 text-white font-bold shadow-xl transition-all active:scale-95
            ${isGenerating || !config.topic ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 shadow-indigo-200'}`}
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              <span className="animate-pulse">正在深度构思并撰写长文...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>一键生成深度总结文章</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default InputForm;
