import { useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { LeadFormLead } from './LeadFormModal';
import { X } from '../../components/icons';

interface LeadActivity {
  id: string; fromStage?: string | null; toStage?: string | null; note?: string | null; createdAt: string;
}
interface LeadDetail extends LeadFormLead {
  stage: string;
  branchId: string;
  preScreenPassed?: boolean | null;
  dropReason?: string | null;
  branch: { name: string };
  assignedTo?: { id: string; fullName: string; designation: string } | null;
  loanApplication?: { id: string; applicationNumber: string; status: string } | null;
  activities: LeadActivity[];
}
interface EmployeeOption { id: string; fullName: string; designation: string; branchId?: string | null }
interface LeadDocument {
  id: string; documentType: string; fileName: string; isVerified: boolean; createdAt: string;
}

/** Forward-only pipeline, mirrored from the backend's PIPELINE_ORDER. */
const PIPELINE = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED'];

const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;
const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (v: string): string =>
  new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const label = (s?: string | null) => (s ?? '').replaceAll('_', ' ');

type Tab = 'details' | 'documents' | 'activity';

/**
 * Lead workspace: full detail, the KYC documents the customer submitted, the
 * audit timeline, and every pipeline action the signed-in role is allowed —
 * assign, stage move, pre-screen and drop. Leads are never hard-deleted;
 * dropping with a reason is the terminal "remove from pipeline" action.
 */
export default function LeadDetailModal({
  leadId,
  onClose,
  onEdit,
}: {
  leadId: string;
  onClose: () => void;
  onEdit: (lead: LeadFormLead) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('details');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const detailQuery = useQuery({
    queryKey: ['/leads', leadId],
    queryFn: () => api.get(`/leads/${leadId}`).then((r) => r.data.data as LeadDetail),
  });
  const lead = detailQuery.data;

  const isOpen = !!lead && lead.stage !== 'CONVERTED' && lead.stage !== 'DROPPED';
  const canUpdate = can(user?.role, 'lead:update');
  const canAssign = can(user?.role, 'lead:assign');
  const canStage = can(user?.role, 'lead:stage');

  const invalidateLeads = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/leads') });
    qc.invalidateQueries({ queryKey: ['lead-funnel'] });
  };
  const onActionError = (fallback: string) => (err: unknown) =>
    setMessage({ ok: false, text: apiMessage(err, fallback) });

  // ── Assign ──
  const [assigneeId, setAssigneeId] = useState('');
  const employeesQuery = useQuery({
    queryKey: ['/employees', 'options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canAssign && isOpen,
  });
  // The API already scopes /employees to the caller's branch, and assignLead
  // re-validates the branch server-side — so the returned list is the correct
  // set of assignable officers as-is (no extra client filtering needed).
  const assignees = employeesQuery.data ?? [];

  const assign = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/assign`, { assignedToId: assigneeId }),
    onSuccess: () => { setMessage({ ok: true, text: 'Lead assigned.' }); setAssigneeId(''); invalidateLeads(); },
    onError: onActionError('Could not assign the lead.'),
  });

  // ── Stage move / drop ──
  const currentIndex = PIPELINE.indexOf(lead?.stage ?? '');
  const nextStages = currentIndex >= 0 ? PIPELINE.slice(currentIndex + 1) : [];
  const [stageNote, setStageNote] = useState('');

  const moveStage = useMutation({
    mutationFn: (body: { stage: string; note?: string; dropReason?: string }) =>
      api.post(`/leads/${leadId}/stage`, body),
    onSuccess: (_r, body) => {
      setMessage({ ok: true, text: body.stage === 'DROPPED' ? 'Lead dropped.' : `Moved to ${label(body.stage)}.` });
      setStageNote('');
      invalidateLeads();
    },
    onError: onActionError('Could not update the stage.'),
  });

  const dropLead = () => {
    const reason = window.prompt('Reason for dropping this lead? (required)');
    if (!reason?.trim()) return;
    moveStage.mutate({ stage: 'DROPPED', dropReason: reason.trim() });
  };

  // ── Pre-screen ──
  const preScreen = useMutation({
    mutationFn: (passed: boolean) => api.post(`/leads/${leadId}/pre-screen`, { passed }),
    onSuccess: () => { setMessage({ ok: true, text: 'Pre-screening recorded.' }); invalidateLeads(); },
    onError: onActionError('Could not record pre-screening.'),
  });

  // ── Documents the customer submitted ──
  const documentsQuery = useQuery({
    queryKey: ['/leads', leadId, 'documents'],
    queryFn: () => api.get(`/leads/${leadId}/documents`).then((r) => r.data.data as LeadDocument[]),
    enabled: tab === 'documents',
  });
  const documents = documentsQuery.data ?? [];

  const downloadDocument = async (doc: LeadDocument) => {
    setMessage(null);
    try {
      const res = await api.get(`/leads/${leadId}/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ ok: false, text: 'Could not download the file.' });
    }
  };

  const stagePill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{label(s)}</span>;
  const activities = lead?.activities ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: `Activity${activities.length ? ` (${activities.length})` : ''}` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {!lead ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <header className="row">
              <div>
                <h2>{lead.fullName}</h2>
                <p className="muted">{lead.phoneNumber} · {lead.branch.name}</p>
              </div>
              <div className="row-actions">
                {stagePill(lead.stage)}
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
              </div>
            </header>

            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setMessage(null); }}>
                  {t.label}
                </button>
              ))}
            </div>

            {message && <div className={message.ok ? 'success-box' : 'error-box'}>{message.text}</div>}

            {tab === 'details' && (
              <>
                <dl className="detail-list">
                  <div><dt>Requested amount</dt><dd>{lead.requestedAmount ? inr(lead.requestedAmount) : '—'}</dd></div>
                  <div><dt>Purpose</dt><dd>{lead.purpose ?? '—'}</dd></div>
                  <div><dt>Source</dt><dd>{lead.source ?? '—'}</dd></div>
                  <div><dt>Location</dt><dd>{lead.location ?? '—'}</dd></div>
                  <div><dt>Assigned to</dt><dd>{lead.assignedTo ? `${lead.assignedTo.fullName} (${lead.assignedTo.designation})` : 'Unassigned'}</dd></div>
                  <div><dt>Next follow-up</dt><dd>{fmtDate(lead.nextFollowUpAt)}</dd></div>
                  <div><dt>Pre-screening</dt><dd>
                    {lead.preScreenPassed == null
                      ? <span className="pill pill-pending">Not done</span>
                      : lead.preScreenPassed
                        ? <span className="pill pill-approved">Passed</span>
                        : <span className="pill pill-rejected">Failed</span>}
                  </dd></div>
                  {lead.dropReason && <div><dt>Drop reason</dt><dd>{lead.dropReason}</dd></div>}
                  {lead.loanApplication && (
                    <div><dt>Application</dt><dd><code>{lead.loanApplication.applicationNumber}</code> {stagePill(lead.loanApplication.status)}</dd></div>
                  )}
                </dl>

                {isOpen && (canUpdate || canAssign || canStage) && (
                  <>
                    <h3 className="section-title">Actions</h3>

                    {canStage && (
                      <div className="row-actions">
                        <span className="muted sm-text">Pre-screening:</span>
                        <button type="button" className="sm ghost" disabled={preScreen.isPending} onClick={() => preScreen.mutate(true)}>Mark passed</button>
                        <button type="button" className="sm ghost danger" disabled={preScreen.isPending} onClick={() => preScreen.mutate(false)}>Mark failed</button>
                      </div>
                    )}

                    {canStage && nextStages.length > 0 && (
                      <div className="row-actions">
                        <span className="muted sm-text">Move to:</span>
                        {nextStages.map((s) => (
                          <button key={s} type="button" className="sm" disabled={moveStage.isPending}
                            onClick={() => moveStage.mutate({ stage: s, note: stageNote || undefined })}>
                            {label(s)}
                          </button>
                        ))}
                        <input value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Note (optional)" />
                      </div>
                    )}

                    {canAssign && (
                      <div className="row-actions">
                        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assign to employee">
                          <option value="">— Assign to —</option>
                          {assignees.map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.designation}</option>)}
                        </select>
                        <button type="button" className="sm" disabled={!assigneeId || assign.isPending} onClick={() => assign.mutate()}>Assign</button>
                      </div>
                    )}

                    <div className="row-actions">
                      {canUpdate && <button type="button" className="sm ghost" onClick={() => onEdit(lead)}>Edit details</button>}
                      {canStage && <button type="button" className="sm ghost danger" disabled={moveStage.isPending} onClick={dropLead}>Drop lead…</button>}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'documents' && (
              <div className="doc-list">
                {documentsQuery.isLoading && <p className="muted">Loading documents…</p>}
                {!documentsQuery.isLoading && documents.length === 0 && (
                  <p className="muted">No documents uploaded for this lead yet.</p>
                )}
                {documents.map((d) => (
                  <div key={d.id} className="doc-row">
                    <span className="doc-meta">
                      <strong>{label(d.documentType)}</strong>
                      <span className="muted sm-text">{d.fileName} · {fmtDateTime(d.createdAt)}</span>
                    </span>
                    <span className="row-actions">
                      {d.isVerified
                        ? <span className="pill pill-approved">Verified</span>
                        : <span className="pill pill-pending">Pending</span>}
                      <button type="button" className="sm ghost" onClick={() => downloadDocument(d)}>Download</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'activity' && (
              <div className="doc-list">
                {activities.length === 0 && <p className="muted">No activity recorded yet.</p>}
                {activities.map((a) => (
                  <div key={a.id} className="doc-row">
                    <span className="doc-meta">
                      <strong>
                        {a.fromStage || a.toStage
                          ? `${a.fromStage ? `${label(a.fromStage)} → ` : ''}${label(a.toStage) || '—'}`
                          : 'Note'}
                      </strong>
                      {a.note && <span className="muted sm-text">{a.note}</span>}
                    </span>
                    <span className="muted sm-text">{fmtDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
