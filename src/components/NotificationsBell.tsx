import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Modal } from './Modal';
import { AlertCircle } from './icons';
import { fmtDate } from '../lib/format';

interface Notification {
  id: string;
  title: string;
  body: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Header bell: shows the unread count and, on click, a panel of recent
 * notifications with mark-read / mark-all-read. Polls the unread count so the
 * badge stays fresh without a manual refresh.
 */
export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const countQuery = useQuery({
    queryKey: ['/notifications/unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => (r.data.data as { unread: number }).unread),
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ['/notifications'],
    queryFn: () => api.get('/notifications?pageSize=30').then((r) => r.data.data as Notification[]),
    enabled: open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/notifications'] });
    qc.invalidateQueries({ queryKey: ['/notifications/unread-count'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: refresh,
  });

  const unread = countQuery.data ?? 0;

  return (
    <>
      <button type="button" className="icon-btn notif-bell" onClick={() => setOpen(true)} aria-label="Notifications" title="Notifications">
        <AlertCircle size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <Modal
          size="sm"
          onClose={() => setOpen(false)}
          icon={<AlertCircle size={20} />}
          title="Notifications"
          subtitle={unread ? `${unread} unread` : 'You’re all caught up'}
          footer={<>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button>
            {unread > 0 && <button type="button" onClick={() => markAll.mutate()} disabled={markAll.isPending}>Mark all read</button>}
          </>}
        >
          <div className="notif-list">
            {listQuery.isLoading ? (
              <p className="muted">Loading…</p>
            ) : !listQuery.data?.length ? (
              <p className="muted">No notifications yet.</p>
            ) : (
              listQuery.data.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.isRead ? '' : 'unread'}`}
                  onClick={() => !n.isRead && markRead.mutate(n.id)}
                  style={{ cursor: n.isRead ? 'default' : 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border, #eee)' }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    {!n.isRead && <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--primary, #2563eb)', display: 'inline-block' }} />}
                    <strong>{n.title}</strong>
                    <span className="muted sm-text" style={{ marginLeft: 'auto' }}>{fmtDate(n.createdAt)}</span>
                  </div>
                  <div className="muted sm-text">{n.body}</div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
