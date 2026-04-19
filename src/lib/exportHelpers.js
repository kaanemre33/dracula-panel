import * as XLSX from 'xlsx';

export function appendStructuredSheet(workbook, { sheetName, title, summaryRows = [], columns = [], rows = [] }) {
  const headerRowIndex = summaryRows.length + 2;
  const aoa = [
    [title],
    ...summaryRows.map((line) => [line]),
    [],
    columns.map((column) => column.label),
    ...rows.map((row) =>
      columns.map((column) => {
        const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
        if (column.type === 'currency' || column.type === 'number') return Number(value || 0);
        return value ?? '';
      })
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const lastColumn = Math.max(columns.length - 1, 0);
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
  ];
  worksheet['!cols'] = columns.map((column) => ({ wch: column.width || 18 }));
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: headerRowIndex, c: lastColumn },
    }),
  };

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex + 1 + rowIndex, c: columnIndex });
      const cell = worksheet[cellAddress];
      if (!cell) return;
      if (column.type === 'currency') {
        cell.z = '#,##0 [$₺-41F]';
      } else if (column.type === 'number') {
        cell.z = '0';
      }
    });
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return worksheet;
}

export function renderPdfHeader(doc, title, summaryRows = []) {
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  doc.setFontSize(11);

  let y = 32;
  summaryRows.forEach((line) => {
    doc.text(String(line || ''), 14, y);
    y += 10;
  });

  return y + 6;
}

export function renderPdfSection(doc, title, lines = [], startY = 20) {
  let y = startY;
  if (title) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.text(title, 14, y);
    y += 10;
  }

  doc.setFontSize(10);
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line || ''), 180);
    if (y + wrapped.length * 6 > 285) {
      doc.addPage();
      y = 20;
    }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 6 + 2;
  });

  return y;
}
