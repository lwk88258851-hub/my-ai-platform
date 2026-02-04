
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export interface DocxXmlSegment {
  index: number;
  text: string;
}

export const parseTemplateFile = async (file: File): Promise<{ text: string; segments?: DocxXmlSegment[] }> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    return await extractDocxSegments(file);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return { text: await parseExcel(file) };
  } else {
    throw new Error('不支持的文件格式。请上传 .docx 或 .xlsx 文件。');
  }
};

const extractDocxSegments = async (file: File): Promise<{ text: string; segments: DocxXmlSegment[] }> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");

    if (!docXml) throw new Error("无法读取 document.xml");

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, "application/xml");
    const textNodes = xmlDoc.getElementsByTagName("w:t");
    
    const segments: DocxXmlSegment[] = [];
    let combinedText = "";

    for (let i = 0; i < textNodes.length; i++) {
      const text = textNodes[i].textContent || "";
      if (text.trim().length > 0) {
        segments.push({ index: i, text });
        combinedText += `[Seg ${i}]: ${text}\n`;
      }
    }

    return { text: combinedText, segments };
  } catch (error) {
    console.error("Docx segments error", error);
    throw new Error("无法解析 Word 文件的详细结构");
  }
};

const parseExcel = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let content = '[Excel 结构]:\n';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      content += `--- 表格: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}\n`;
    });
    return content;
  } catch (error) {
    throw new Error("无法读取 Excel 内容");
  }
};
