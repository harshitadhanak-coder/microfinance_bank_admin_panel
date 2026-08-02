import { useState } from 'react';
import { api } from '../api/client';
import { apiMessage, isoLocalDate } from '../lib/format';
import { useToast } from './Toast';
import { FileSpreadsheet, Loader } from './icons';

/**
 * The Export control shared by the HR list screens (Attendance, Holidays, Exit
 * Management, Payroll, Salary Advances).
 *
 * One button, one outcome: an Excel workbook. There is no format picker — the
 * dropdown it replaced made a single-purpose action look like a menu and cost a
 * click for a choice nobody made. The endpoints still honour `?format=csv` for
 * an API caller that wants it.
 *
 * The server builds the file, so the download is always the whole filtered set
 * rather than whatever page the table happens to be showing. The caller passes
 * the endpoint and the filter query it is currently displaying.
 */

export type ExportFormat = 'xlsx' | 'csv';
export type ExportParams = Record<string, string | number | undefined | null>;

/**
 * Fetches an export endpoint as a blob and saves it. Split out of the button so
 * a row action (e.g. per-month export in the payroll run list) can trigger the
 * same download without rendering one.
 */
export async function downloadExport(
  url: string,
  fileBase: string,
  format: ExportFormat = 'xlsx',
  params?: ExportParams,
): Promise<void> {
  const query = new URLSearchParams({ format });
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  });
  const res = await api.get(`${url}?${query.toString()}`, { responseType: 'blob' });
  const objectUrl = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${fileBase}-${isoLocalDate(new Date())}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export function ExportButton({
  url,
  params,
  fileBase,
  disabled,
  label = 'Export',
}: {
  /** Export endpoint, e.g. `/human-resources/attendance/export`. */
  url: string;
  /** The list's active filters, forwarded verbatim so the file matches the screen. */
  params?: ExportParams;
  /** Download filename without extension; a date stamp is appended. */
  fileBase: string;
  disabled?: boolean;
  label?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await downloadExport(url, fileBase, 'xlsx', params);
      toast.success('Excel file downloaded.');
    } catch (e) {
      toast.error(apiMessage(e, 'Export failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="ghost brass"
      disabled={disabled || busy}
      title="Download this list as an Excel workbook"
      onClick={run}
    >
      {busy ? <Loader size={15} /> : <FileSpreadsheet size={15} />} {busy ? 'Exporting…' : label}
    </button>
  );
}
