import { ReactNode } from 'react';
import { AlertCircle, Search, FileSpreadsheet } from './icons';

type EmptyVariant = 'no-data' | 'no-results' | 'error' | 'no-permission';

const DEFAULT_ICON: Record<EmptyVariant, ReactNode> = {
  'no-data': <FileSpreadsheet size={24} />,
  'no-results': <Search size={24} />,
  error: <AlertCircle size={24} />,
  'no-permission': <AlertCircle size={24} />,
};

/**
 * Differentiated empty states so a list never shows a bare "Nothing here".
 * `variant` distinguishes no-data-yet (add your first…) from no-results
 * (clear filters), from error (retry), from no-permission. Pass an `action`
 * (a button/link) for the primary next step.
 */
export function EmptyState({
  variant = 'no-data',
  icon,
  title,
  message,
  action,
}: {
  variant?: EmptyVariant;
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`empty-state empty-${variant}`}>
      <span className="empty-icon" aria-hidden="true">{icon ?? DEFAULT_ICON[variant]}</span>
      <p className="empty-title">{title}</p>
      {message && <p className="empty-message">{message}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
