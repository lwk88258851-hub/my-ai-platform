
import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedContent, ReportConfig } from "../types";

/**
 * 生成完整的深度报告内容
 * AI 将根据用户输入的描述自动构建文章结构，拒绝列表，追求长篇叙事
 */
export const generateReportText = async (
  config: ReportConfig,
  imageCount: number,
  templateContext: string = ''
): Promise<GeneratedContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const isTemplateMode = config.mode === 'template';
  // 切换为 Pro 模型以获得更高质量的文学创作能力
  const model = 'gemini-3-pro-preview';

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      design: {
        type: Type.OBJECT,
        properties: {
          primaryColor: { type: Type.STRING },
          fontStyle: { type: Type.STRING, enum: ["songti", "heiti", "kaiti"] }
        },
        required: ["primaryColor", "fontStyle"]
      },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["text", "image_group", "table"] },
            heading: { type: Type.STRING, description: "章回体小标题，要求具有教育哲学高度和文学美感" },
            content: { type: Type.STRING, description: "深度展开的长文本叙事，严禁使用列表或短句，要求段落丰满、描写细腻" },
            imageIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            layoutHint: { type: Type.STRING, enum: ["grid", "collage", "stack"] }
          },
          required: ["type"]
        }
      }
    },
    required: ["title", "design", "sections"]
  };

  let prompt = '';
  if (isTemplateMode) {
    prompt = `
      你是一个公文改写专家。请在保持原文档严谨性的前提下，将以下信息进行长篇扩充并填充至模版中：
      原文档参考内容：${templateContext}
      新的主题：${config.topic}
      提供的新鲜素材：${config.description}
      要求：不仅是填充，更要用优美的笔触将零散的信息串联成逻辑严密的文章。
    `;
  } else {
    prompt = `
      你现在是一名在教育界享有盛誉、文字功底极深的老教师/教导主任。
      请针对 "${config.topic}" 这一主题，撰写一篇具有深度、厚度和温度的长篇班会/活动总结报告。
      
      **原始素材库：**
      "${config.description}"
      
      **核心写作禁令：**
      - ❌ 禁止使用“1. 2. 3.”这种要点罗列。
      - ❌ 禁止使用简短的短句。
      - ❌ 禁止内容空洞、套话连篇。
      
      **核心写作要求：**
      1. **文章体裁**：叙事散文与公文总结的结合体。要有文学性的铺陈，也要有教育性的总结。
      2. **结构自动构建**：请基于原始素材，自动构思以下五个维度（请勿直接使用这些词作为标题，要美化它们）：
         - **序幕：教育的初衷**（交代背景，描绘氛围）。
         - **纪实：交互的瞬间**（详细描写活动中发生的细节，尤其是人的反应）。
         - **洞察：心灵的共鸣**（从心理学、教育学角度深度解析活动的意义）。
         - **升华：灵魂的洗礼**（描述师生共同成长的感悟）。
         - **远景：不息的守望**（对未来的具体规划和展望）。
      3. **篇幅与文采**：总体字数要求在 1500-2500 字之间。使用 "${config.tone}" 的语气。大量运用比喻、排比和教育名言。每一章节的 content 必须是完整、连贯、且极具张力的长段落。
      
      **图片与人员：**
      - 参与人员：${config.names}
      - 图片配比：你有 ${imageCount} 张图片（索引 1-${imageCount}），请将它们分布在最能引起情感共鸣的章节中（type: "image_group"）。
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { 
        responseMimeType: "application/json", 
        responseSchema: responseSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI 返回内容为空");
    return JSON.parse(text) as GeneratedContent;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
