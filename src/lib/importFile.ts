import * as XLSX from 'xlsx';

/**
 * Client-side spreadsheet parsing for the bulk-import modals. Handles .csv,
 * .xlsx and .xls via SheetJS. Rows are returned as objects keyed by the header
 * row; header lookup is normalised (case / spacing / punctuation insensitive)
 * so a human-edited template still maps to the API field names.
 */
export async function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]!, { defval: '', raw: true });
}

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Reads a cell by header name, ignoring case / spacing / punctuation. */
export function readCell(row: Record<string, unknown>, header: string): unknown {
  const target = normalise(header);
  for (const key of Object.keys(row)) {
    if (normalise(key) === target) return row[key];
  }
  return undefined;
}

const csvCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Triggers a browser download of a one-row CSV template. */
export function downloadCsvTemplate(filename: string, headers: string[], example: string[]): void {
  const csv = `${headers.map(csvCell).join(',')}\n${example.map(csvCell).join(',')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
