
import React from 'react';
import { Download, FileText, CheckCircle2 } from 'lucide-react';
import { GeneratedContent, ImageData, ContentSection } from '../types';

interface ReportPreviewProps {
  content: GeneratedContent | null;
  images: ImageData[];
  onDownloadDocx: () => void;
  onDownloadExcel: () => void;
  mode: 'report' | 'template';
}

const SmartImageGrid: React.FC<{ section: ContentSection, images: ImageData[] }> = ({ section, images }) => {
  if (!section.imageIndices || section.imageIndices.length === 0) return null;
  
  const group = section.imageIndices.map(i => images[i - 1]).filter(Boolean);
  if (group.length === 0) return null;

  const count = group.length;

  const renderLayout = () => {
    if (count === 1) {
      return (
        <div className="w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm my-4">
          <img src={group[0].previewUrl} className="w-full h-auto" alt="AI Layout Image" />
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-3 my-4">
          {group.map((img, idx) => (
            <div key={idx} className="rounded-md overflow-hidden border border-slate-200 shadow-sm">
              <img src={img.previewUrl} className="w-full h-full object-cover aspect-[4/3]" alt="AI Layout Image" />
            </div>
          ))}
        </div>
      );
    }

    if (count === 3) {
      const widestIndex = group.reduce((maxIdx, img, currIdx) => 
        img.aspectRatio > group[maxIdx].aspectRatio ? currIdx : maxIdx, 0);
      const otherIndices = [0, 1, 2].filter(i => i !== widestIndex);

      return (
        <div className="grid grid-cols-2 gap-3 my-4">
          <div className="col-span-2 rounded-md overflow-hidden border border-slate-200 shadow-sm">
             <img src={group[widestIndex].previewUrl} className="w-full h-auto max-h-[300px] object-cover" alt="AI Layout Image" />
          </div>
          {otherIndices.map(idx => (
             <div key={idx} className="rounded-md overflow-hidden border border-slate-200 shadow-sm">
                <img src={group[idx].previewUrl} className="w-full h-full object-cover aspect-square" alt="AI Layout Image" />
             </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 my-4">
        {group.slice(0, 4).map((img, idx) => (
          <div key={idx} className="rounded-md overflow-hidden border border-slate-200 shadow-sm">
            <img src={img.previewUrl} className="w-full h-full object-cover aspect-video" alt="AI Layout Image" />
          </div>
        ))}
      </div>
    );
  };

  return <div className="my-8">{renderLayout()}</div>;
};

const ReportPreview: React.FC<ReportPreviewProps> = ({ content, images, onDownloadDocx, mode }) => {
  if (!content) {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-dashed border-slate-200 h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-slate-400 p-8">
        <FileText size={64} className="mb-4 opacity-50" />
        <p className="text-lg font-medium font-sans">智能创作中心</p>
        <p className="text-sm mt-2 text-center max-w-xs">AI 将为您构思深度长文，生成具有文学美感的教育报告预览</p>
      </div>
    );
  }

  const { primaryColor, fontStyle } = content.design;
  
  // 字体映射
  const getFontFamilyClass = () => {
    switch(fontStyle) {
      case 'kaiti': return 'font-kaiti';
      case 'heiti': return 'font-sans font-bold';
      case 'songti': return 'font-serif';
      default: return 'font-serif';
    }
  };

  const fontClass = getFontFamilyClass();
  const isTemplate = mode === 'template' && content.replacements;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center z-10 shadow-sm">
        <h3 className="font-semibold text-slate-700 flex items-center">
          <FileText size={18} className="mr-2 text-indigo-600" />
          {isTemplate ? "模版内容改写预览" : "深度叙事报告预览"}
        </h3>
        <div className="flex space-x-2">
          <button 
            onClick={onDownloadDocx} 
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-indigo-200 active:scale-95"
          >
            <Download size={16} />
            <span>导出专业 Word (A4版式)</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-100/80">
        <div className="bg-white shadow-2xl min-h-full p-10 md:p-16 max-w-[850px] mx-auto rounded-sm border border-slate-200 relative">
          {/* A4 模拟页边距提示线（可选，视觉辅助） */}
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-slate-50 hidden md:block"></div>
          
          <h1 className={`text-3xl md:text-4xl font-bold text-center mb-16 ${fontClass}`} style={{ color: primaryColor }}>
            {content.title}
          </h1>

          <div className={`space-y-12 text-slate-900 leading-[1.8] text-justify text-[1.1rem]`}>
            {isTemplate && (
              <div className="bg-indigo-50 border-l-4 border-indigo-500 p-5 rounded-r-lg mb-8 text-sm flex items-start space-x-3">
                <CheckCircle2 size={18} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                <p className="text-indigo-900 font-medium">系统已根据原文档格式完成智能扩充与润色。导出的文件将严谨保留模版样式。</p>
              </div>
            )}

            {content.sections.map((section, idx) => {
              return (
                <div key={idx} className="group">
                  {section.heading && (
                    <div className="relative mb-6">
                      <h2 className={`text-2xl font-bold inline-block pb-2 ${fontClass}`} style={{ color: primaryColor }}>
                        {section.heading}
                      </h2>
                      <div className="h-0.5 w-16 transition-all group-hover:w-full" style={{ backgroundColor: primaryColor }}></div>
                    </div>
                  )}
                  
                  {section.type === 'text' && section.content && (
                    <div className={`article-content whitespace-pre-wrap ${fontClass} text-slate-800`}>
                      {/* 在这里手动应用缩进显示 */}
                      {section.content.split('\n').map((para, pIdx) => (
                        para.trim() ? (
                          <p key={pIdx} className="mb-4 text-indent-2 indent-[2em]">
                            {para.trim()}
                          </p>
                        ) : null
                      ))}
                    </div>
                  )}
                  
                  {section.type === 'image_group' && <SmartImageGrid section={section} images={images} />}
                  
                  {section.type === 'table' && section.tableData && (
                    <div className="overflow-x-auto my-10 shadow-sm border border-slate-200 rounded-lg">
                      <table className="min-w-full border-collapse">
                        <tbody>
                          {section.tableData.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? "bg-slate-50 font-bold border-b border-slate-300" : "border-b border-slate-100"}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-4 py-3 text-sm text-center border-r border-slate-100 last:border-r-0">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-20 pt-10 border-t border-slate-100 text-right text-slate-400 text-sm italic">
            教育，是一场灵魂的唤醒。 — AI 智绘报告系统
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPreview;
