type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Stop spreadsheet apps from running a cell that starts like a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Downloads a CSV file (UTF-8 with a BOM so Excel reads accents correctly). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
