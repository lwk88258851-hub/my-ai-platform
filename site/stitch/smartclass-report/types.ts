
export interface ImageData {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  aspectRatio: number;
}

export type ToneType = 'formal' | 'emotional' | 'inspiring' | 'relaxed';
export type AppMode = 'report' | 'template';
export type FontStyle = 'songti' | 'heiti' | 'kaiti';

export interface ReportConfig {
  mode: AppMode;
  topic: string;
  names: string;
  description: string; // 替换 keyPoints
  tone: ToneType;
  preferredFont: FontStyle;
  templateFile?: File | null;
}

export interface DesignConfig {
  primaryColor: string;
  fontStyle: FontStyle;
}

export interface ContentSection {
  type: 'text' | 'image_group' | 'table';
  heading?: string;
  content?: string;
  imageIndices?: number[];
  layoutHint?: 'grid' | 'collage' | 'stack';
  tableData?: string[][];
}

export interface GeneratedContent {
  title: string;
  design: DesignConfig;
  sections: ContentSection[];
  replacements?: Record<number, string>;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
