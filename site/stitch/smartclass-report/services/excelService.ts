import * as XLSX from 'xlsx';
import { GeneratedContent } from '../types';

export const generateAndDownloadExcel = (content: GeneratedContent, filename: string) => {
  const wb = XLSX.utils.book_new();
  
  // Flatten content into rows for a simple sheet
  // If the AI generated specific table data, we use that.
  // Otherwise we put text in cells.

  const rows: string[][] = [];

  // Add Title
  rows.push([content.title]);
  rows.push([]); // Spacer

  content.sections.forEach(section => {
    if (section.type === 'table' && section.tableData) {
      section.tableData.forEach(row => {
        rows.push(row);
      });
      rows.push([]); // Spacer
    } else if (section.type === 'text' && section.content) {
      // Split text by lines
      const lines = section.content.split('\n');
      lines.forEach(line => rows.push([line]));
      rows.push([]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Basic styling isn't supported in free SheetJS CE, but content is there.
  XLSX.utils.book_append_sheet(wb, ws, "AI Report");

  XLSX.writeFile(wb, `${filename}.xlsx`);
};