
import * as docx from 'https://esm.sh/docx@8.5.0';
import FileSaver from 'https://esm.sh/file-saver@2.0.5';
import JSZip from 'jszip';
import { GeneratedContent, ImageData } from '../types';

const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel } = docx;
const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;

export const editAndDownloadDocx = async (
  originalFile: File,
  replacements: Record<string, string>,
  filename: string
) => {
  const arrayBuffer = await originalFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  let docXml = await zip.file("word/document.xml")?.async("string");

  if (!docXml) throw new Error("无法读取 document.xml");

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, "application/xml");
  const textNodes = xmlDoc.getElementsByTagName("w:t");

  Object.entries(replacements).forEach(([idxStr, newText]) => {
    const idx = parseInt(idxStr);
    if (textNodes[idx]) {
      textNodes[idx].textContent = newText;
    }
  });

  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(xmlDoc);
  zip.file("word/document.xml", newXml);

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `AI修订_${filename}`);
};

export const generateAndDownloadDocx = async (
  content: GeneratedContent,
  images: ImageData[],
  topic: string
) => {
  const docChildren: any[] = [];
  const { primaryColor, fontStyle } = content.design;
  const headerFont = fontStyle === 'kaiti' ? "KaiTi" : "SimHei";
  const bodyFont = fontStyle === 'songti' ? "SimSun" : (fontStyle === 'kaiti' ? "KaiTi" : "Microsoft YaHei");

  // 1. Title
  docChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 800, before: 400 },
    children: [new TextRun({ 
      text: content.title || topic, 
      size: 56, 
      bold: true, 
      color: primaryColor.replace('#', ''), 
      font: headerFont 
    })]
  }));

  // 2. Sections (Branches)
  for (const section of content.sections) {
    // Add Heading if present
    if (section.heading) {
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        border: {
          left: { color: primaryColor.replace('#', ''), space: 10, style: BorderStyle.SINGLE, size: 20 }
        },
        children: [new TextRun({ 
          text: " " + section.heading, 
          size: 32, 
          bold: true, 
          color: primaryColor.replace('#', ''), 
          font: headerFont 
        })]
      }));
    }

    if (section.type === 'text' && section.content) {
      // Split by paragraphs to handle indentation correctly
      const paragraphs = section.content.split(/\n+/);
      paragraphs.forEach(pText => {
        if (!pText.trim()) return;
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: pText.trim(), size: 24, font: bodyFont })],
          spacing: { before: 200, after: 200, line: 400 },
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 480 } // 2-character indentation (24pt * 2)
        }));
      });
    } else if (section.type === 'image_group' && section.imageIndices) {
      const selectedImages = section.imageIndices.map(i => images[i - 1]).filter(Boolean);
      if (selectedImages.length === 0) continue;

      if (selectedImages.length === 1) {
        docChildren.push(new Paragraph({
          children: [createImageRun(selectedImages[0])],
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 300 }
        }));
      } else {
        const rowCount = Math.ceil(selectedImages.length / 2);
        const rows = [];
        for (let r = 0; r < rowCount; r++) {
          const cellImages = selectedImages.slice(r * 2, r * 2 + 2);
          rows.push(new TableRow({
            children: cellImages.map(img => new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [createImageRun(img, 220)], alignment: AlignmentType.CENTER })],
              width: { size: 50, type: WidthType.PERCENTAGE }
            }))
          }));
        }
        docChildren.push(new Table({ 
          rows, 
          width: { size: 100, type: WidthType.PERCENTAGE }, 
          borders: BorderStyle.NONE,
          spacing: { before: 200, after: 200 } 
        }));
      }
    }
  }

  const doc = new Document({ 
    creator: "智绘班会 AI",
    title: topic,
    sections: [{ 
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: docChildren 
    }] 
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${topic}_深度总结报告.docx`);
};

function createImageRun(imgData: ImageData, targetWidth = 450) {
  const binaryString = window.atob(imgData.base64.split(',')[1]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  
  const width = targetWidth;
  const height = width / imgData.aspectRatio;

  return new ImageRun({ data: bytes, transformation: { width, height } });
}
