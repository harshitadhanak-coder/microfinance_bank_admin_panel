import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Tabs, TabDef } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ArrowRight, Check, ListChecks, Pencil, Trash2, UserCheck, X } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeOption, LeadDetail, LeadDocument, PIPELINE, stageLabel } from './shared';

const fmtDateTime = (v: string): string =>
  new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

type TabKey = 'details' | 'documents' | 'activity';

/**
 * Lead — Details. Tabbed workspace (Details · Documents · Activity) replacing the
 * detail modal: full record, the KYC documents submitted, an audit timeline, and
 * every pipeline action the role may take — assign, stage move, pre-screen, drop.
 * Leads are never hard-deleted; dropping with a reason is the terminal action.
 */
export default function LeadDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'details';
  const setTab = (t: TabKey) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const detailQuery = useQuery({
    queryKey: ['/leads', id],
    queryFn: () => api.get(`/leads/${id}`).then((r) => r.data.data as LeadDetail),
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
  const onErr = (fallback: string) => (err: unknown) => toast.error(apiMessage(err, fallback));

  // ── Assign ──
  const [assigneeId, setAssigneeId] = useState('');
  const employeesQuery = useQuery({
    queryKey: ['/employees', 'options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canAssign && isOpen,
  });
  const assign = useMutation({
    mutationFn: () => api.post(`/leads/${id}/assign`, { assignedToId: assigneeId }),
    onSuccess: () => { toast.success('Lead assigned.'); setAssigneeId(''); invalidateLeads(); },
    onError: onErr('Could not assign the lead.'),
  });

  // ── Stage move / drop ──
  const currentIndex = PIPELINE.indexOf(lead?.stage ?? '');
  const nextStages = currentIndex >= 0 ? PIPELINE.slice(currentIndex + 1) : [];
  const [stageNote, setStageNote] = useState('');
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropReason, setDropReason] = useState('');
  const moveStage = useMutation({
    mutationFn: (body: { stage: string; note?: string; dropReason?: string }) => api.post(`/leads/${id}/stage`, body),
    onSuccess: (_r, body) => { toast.success(body.stage === 'DROPPED' ? 'Lead dropped.' : `Moved to ${stageLabel(body.stage)}.`); setStageNote(''); invalidateLeads(); },
    onError: onErr('Could not update the stage.'),
  });

  // ── Pre-screen ──
  const preScreen = useMutation({
    mutationFn: (passed: boolean) => api.post(`/leads/${id}/pre-screen`, { passed }),
    onSuccess: () => { toast.success('Pre-screening recorded.'); invalidateLeads(); },
    onError: onErr('Could not record pre-screening.'),
  });

  // ── Documents ──
  const documentsQuery = useQuery({
    queryKey: ['/leads', id, 'documents'],
    queryFn: () => api.get(`/leads/${id}/documents`).then((r) => r.data.data as LeadDocument[]),
    enabled: tab === 'documents',
  });
  const documents = documentsQuery.data ?? [];
  const downloadDocument = async (doc: LeadDocument) => {
    try {
      const res = await api.get(`/leads/${id}/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file.'); }
  };

  const activities = lead?.activities ?? [];
  const tabs: TabDef[] = [
    { key: 'details', label: 'Details' },
    { key: 'documents', label: 'Documents' },
    { key: 'activity', label: 'Activity', count: activities.length || undefined },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Leads', to: '/leads' }, { label: lead?.fullName ?? 'Lead' }]}
        title={lead?.fullName ?? 'Lead'}
        subtitle={lead ? <>{lead.phoneNumber} · {lead.branch.name}</> : undefined}
        meta={lead && <Badge status={lead.stage} />}
        actions={lead && canUpdate && isOpen && (
          <button className="btn-lg" onClick={() => navigate(`/leads/${id}/edit`)}><Pencil size={15} /> Edit</button>
        )}
        tabs={<Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as TabKey)} />}
      />

      {!lead ? (
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      ) : (
        <>
          {tab === 'details' && (
            <div className="detail-cols">
              <Card title="Lead details">
                <dl className="detail-list">
                  <div><dt>Requested amount</dt><dd className="num">{lead.requestedAmount ? inr(lead.requestedAmount) : '—'}</dd></div>
                  <div><dt>Purpose</dt><dd>{lead.purpose ?? '—'}</dd></div>
                  <div><dt>Source</dt><dd>{lead.source ?? '—'}</dd></div>
                  <div><dt>Location</dt><dd>{lead.location ?? '—'}</dd></div>
                  <div><dt>Assigned to</dt><dd>{lead.assignedTo ? `${lead.assignedTo.fullName} (${lead.assignedTo.designation})` : 'Unassigned'}</dd></div>
                  <div><dt>Next follow-up</dt><dd>{fmtDate(lead.nextFollowUpAt)}</dd></div>
                  <div><dt>Pre-screening</dt><dd>
                    {lead.preScreenPassed == null ? <Badge tone="warning">Not done</Badge>
                      : lead.preScreenPassed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Failed</Badge>}
                  </dd></div>
                  {lead.dropReason && <div><dt>Drop reason</dt><dd>{lead.dropReason}</dd></div>}
                  {lead.loanApplication && (
                    <div><dt>Converted to</dt><dd><a className="cell-link" onClick={() => navigate('/loans/applications')}><code>{lead.loanApplication.applicationNumber}</code></a> <Badge status={lead.loanApplication.status} /></dd></div>
                  )}
                </dl>
              </Card>

              {isOpen && (canUpdate || canAssign || canStage) ? (
                <Card title={<><ListChecks size={16} /> Pipeline actions</>}>
                  {canStage && (
                    <div className="action-group">
                      <div className="action-group-head">
                        <span className="action-group-label">Pre-screening</span>
                        <span className="action-group-hint">Record the initial eligibility check.</span>
                      </div>
                      <div className="action-btn-row">
                        <button type="button" className="sm ghost" disabled={preScreen.isPending} onClick={() => preScreen.mutate(true)}><Check size={14} /> Mark passed</button>
                        <button type="button" className="sm ghost danger" disabled={preScreen.isPending} onClick={() => preScreen.mutate(false)}><X size={14} /> Mark failed</button>
                      </div>
                    </div>
                  )}

                  {canStage && nextStages.length > 0 && (
                    <div className="action-group">
                      <div className="action-group-head">
                        <span className="action-group-label">Move to stage</span>
                        <span className="action-group-hint">Advance along the pipeline — you'll confirm before it moves.</span>
                      </div>
                      <label className="action-note">
                        Note (optional)
                        <input value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Add context for this move" />
                      </label>
                      <div className="action-btn-row">
                        {nextStages.map((s, i) => (
                          <button key={s} type="button" className={`sm stage-btn${i === 0 ? '' : ' ghost'}`} disabled={moveStage.isPending} onClick={() => setPendingStage(s)}>
                            {stageLabel(s)} <ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {canAssign && (
                    <div className="action-group">
                      <div className="action-group-head">
                        <span className="action-group-label">Assign owner</span>
                        <span className="action-group-hint">Hand this lead to a field officer for follow-up.</span>
                      </div>
                      <div className="action-inline">
                        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assign to employee">
                          <option value="">— Select field officer —</option>
                          {(employeesQuery.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.designation}</option>)}
                        </select>
                        <button type="button" className="sm" disabled={!assigneeId || assign.isPending} onClick={() => assign.mutate()}>
                          <UserCheck size={14} /> {assign.isPending ? 'Assigning…' : 'Assign'}
                        </button>
                      </div>
                    </div>
                  )}

                  {canStage && (
                    <div className="action-group action-manage">
                      <div className="action-btn-row">
                        <button type="button" className="sm ghost danger" disabled={moveStage.isPending} onClick={() => { setDropReason(''); setDropOpen(true); }}><Trash2 size={14} /> Drop lead</button>
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <Card title="Pipeline">
                  <p className="muted">This lead is {stageLabel(lead.stage).toLowerCase()} — no further pipeline actions are available.</p>
                </Card>
              )}
            </div>
          )}

          {tab === 'documents' && (
            <Card title="Submitted documents">
              {documentsQuery.isLoading ? (
                <div className="doc-list"><Skeleton height={46} /><Skeleton height={46} /></div>
              ) : documents.length === 0 ? (
                <EmptyState variant="no-data" title="No documents yet" message="Documents the customer submits for this lead will appear here." />
              ) : (
                <div className="doc-list">
                  {documents.map((d) => (
                    <div key={d.id} className="doc-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="doc-name">{stageLabel(d.documentType)}</div>
                        <div className="doc-meta">{d.fileName} · {fmtDateTime(d.createdAt)}</div>
                      </div>
                      <span className="row-actions" style={{ gap: '6px' }}>
                        <Badge status={d.isVerified ? 'VERIFIED' : 'PENDING'}>{d.isVerified ? 'Verified' : 'Pending'}</Badge>
                        <button type="button" className="sm ghost" onClick={() => downloadDocument(d)}>Download</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'activity' && (
            <Card title="Activity timeline">
              {activities.length === 0 ? (
                <EmptyState variant="no-data" title="No activity yet" message="Stage moves and notes will be logged here." />
              ) : (
                <ul className="timeline">
                  {activities.map((a) => (
                    <li key={a.id}>
                      <span className="timeline-icon"><ArrowRight size={14} /></span>
                      <div className="timeline-body">
                        <strong>
                          {a.fromStage || a.toStage
                            ? `${a.fromStage ? `${stageLabel(a.fromStage)} → ` : ''}${stageLabel(a.toStage) || '—'}`
                            : 'Note'}
                        </strong>
                        {a.note && <span className="muted">{a.note}</span>}
                        <span className="muted sm-text">{fmtDateTime(a.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {pendingStage && (
            <ConfirmDialog
              tone="info"
              icon={<ArrowRight size={22} />}
              title={`Move lead to ${stageLabel(pendingStage)}?`}
              message={stageNote ? `This advances the lead with your note: “${stageNote}”.` : 'This advances the lead to the selected pipeline stage.'}
              confirmLabel="Move lead"
              loading={moveStage.isPending}
              onCancel={() => setPendingStage(null)}
              onConfirm={() => moveStage.mutate({ stage: pendingStage, note: stageNote || undefined }, { onSettled: () => setPendingStage(null) })}
            />
          )}

          {dropOpen && (
            <Modal
              size="md"
              onClose={() => setDropOpen(false)}
              icon={<Trash2 size={20} />}
              title="Drop this lead?"
              subtitle="The lead is removed from the active pipeline. Give a reason for the audit trail — this can't be undone here."
              footer={
                <>
                  <button type="button" className="ghost" onClick={() => setDropOpen(false)} disabled={moveStage.isPending}>Cancel</button>
                  <button type="button" className="danger" disabled={!dropReason.trim() || moveStage.isPending}
                    onClick={() => moveStage.mutate({ stage: 'DROPPED', dropReason: dropReason.trim() }, { onSettled: () => { setDropOpen(false); setDropReason(''); } })}>
                    {moveStage.isPending ? 'Dropping…' : 'Drop lead'}
                  </button>
                </>
              }
            >
              <label>Reason for dropping <span className="req">*</span>
                <textarea value={dropReason} onChange={(e) => setDropReason(e.target.value)} rows={3} placeholder="e.g. Customer no longer interested / ineligible" data-autofocus />
              </label>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
