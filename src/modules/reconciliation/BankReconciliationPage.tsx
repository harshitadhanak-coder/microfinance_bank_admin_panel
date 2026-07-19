import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Ban, Check, Landmark, Loader, Upload } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canAccessModule } from '../auth/permissions';
import {
  BankDeposit,
  BankStatement,
  BankStatementLine,
  BranchRef,
  DEPOSIT_BANKS,
  DepositBank,
  MATCH_STATUS_LABEL,
  MATCH_STATUS_TONE,
  ReconciliationSummary,
} from './reconShared';

const money = (v: string | number | null) => {
  const n = Number(v ?? 0);
  return n > 0 ? <span className="num">{inr(n)}</span> : <span className="muted sm-text">—</span>;
};

/**
 * Bank Reconciliation (stages 6–7). Upload the bank's own statement, which is
 * parsed into lines and auto-matched to branch deposits on bank + date + amount.
 * Whatever doesn't auto-match is resolved by hand here — the final proof that
 * the cash the branch deposited actually reached the bank account.
 */
export default function BankReconciliationPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const table = useServerTable({ pageSize: 15 });
  const [bank, setBank] = useState('');
  const [openStatementId, setOpenStatementId] = useState<string | null>(null);

  const allowed = canAccessModule(user?.role, 'bankReconciliation');
  const canManage = can(user?.role, 'reconcile:manage');

  const listUrl = `/reconciliation/statements?${table.params}${bank ? `&bank=${bank}` : ''}`;
  const statements = useQuery({
    queryKey: [listUrl],
    enabled: allowed,
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['/reconciliation/summary'],
    enabled: allowed,
    queryFn: () => api.get('/reconciliation/summary').then((r) => r.data.data as ReconciliationSummary),
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/reconciliation') });

  if (!allowed) return <p className="muted">You do not have permission to reconcile bank statements.</p>;

  const rows = (statements.data?.data ?? []) as BankStatement[];
  const totalItems = (statements.data?.pagination?.totalItems ?? 0) as number;
  const s = summary.data;

  const columns: Column<BankStatement>[] = [
    { header: 'Uploaded', render: (st) => fmtDate(st.createdAt) },
    { header: 'Bank', render: (st) => <Badge tone="neutral">{st.bank}</Badge> },
    { header: 'Branch', render: (st) => st.branch?.name ?? <span className="muted sm-text">All branches</span> },
    { header: 'Period', render: (st) => (st.periodStart && st.periodEnd ? `${fmtDate(st.periodStart)} – ${fmtDate(st.periodEnd)}` : '—') },
    { header: 'Lines', render: (st) => <span className="num">{st.lineCount}</span> },
    { header: 'Matched', render: (st) => <span className="num">{st.matchedCount} / {st.lineCount}</span> },
    { header: 'Status', render: (st) => <Badge tone={st.status === 'RECONCILED' ? 'success' : 'warning'}>{st.status === 'RECONCILED' ? 'Reconciled' : 'Open'}</Badge> },
    { header: '', render: (st) => <button type="button" className="sm ghost" onClick={() => setOpenStatementId(st.id)}>Open</button> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Bank Reconciliation' }]}
        title="Bank Reconciliation"
        subtitle="Upload the bank statement and match its credits to the branch's deposits — the bank's confirmation that the cash arrived."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="In transit" value={s ? inr(s.inTransit.amount) : '—'} hint={s ? `${s.inTransit.count} deposit(s) awaiting confirmation` : undefined} />
        <StatCard label="Reconciled" value={s ? inr(s.reconciled.amount) : '—'} hint={s ? `${s.reconciled.count} confirmed` : undefined} />
        <StatCard label="Unmatched credits" value={s ? inr(s.unmatchedLines.amount) : '—'} hint={s ? `${s.unmatchedLines.count} statement line(s)` : undefined} />
        <StatCard label="Oldest in transit" value={s ? `${s.oldestInTransitDays} day(s)` : '—'} hint="Deposit not yet on a statement" />
      </div>

      {canManage && <UploadStatementCard branchScoped={!!user?.branchId} onUploaded={refresh} />}

      <div className="section-head" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
        <h3 style={{ margin: 0 }}>Uploaded statements</h3>
        <label style={{ marginLeft: 'auto' }}>Bank
          <select value={bank} onChange={(e) => { setBank(e.target.value); table.setPage(1); }} style={{ marginLeft: 8 }}>
            <option value="">All banks</option>
            {DEPOSIT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={statements.isLoading}
        searchable={false}
        empty="No bank statements uploaded yet. Upload one above to reconcile it against the branch's deposits."
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {openStatementId && (
        <StatementDetailModal
          statementId={openStatementId}
          canManage={canManage}
          onClose={() => setOpenStatementId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

// ── Upload a bank statement ──────────────────────────────────────────────────
function UploadStatementCard({ branchScoped, onUploaded }: { branchScoped: boolean; onUploaded: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bank, setBank] = useState<DepositBank>('SBI');
  const [branchId, setBranchId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const branches = useQuery({
    queryKey: ['/branches', 'statement-options'],
    enabled: !branchScoped,
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchRef[]),
  });

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('bank', bank);
      if (!branchScoped && branchId) fd.append('branchId', branchId);
      if (accountNumber.trim()) fd.append('accountNumber', accountNumber.trim());
      return api.post('/reconciliation/statements', fd).then((r) => r.data.data as { autoMatched: number; statement: BankStatement });
    },
    onSuccess: (res) => {
      toast.success(`Statement uploaded — ${res.autoMatched} line(s) auto-matched.`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
    },
    onError: (err) => setError(apiMessage(err, 'Upload failed.')),
  });

  return (
    <Card title="Upload bank statement">
      <div className="form-grid">
        <label>Bank
          <select value={bank} onChange={(e) => setBank(e.target.value as DepositBank)}>
            {DEPOSIT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        {!branchScoped && (
          <label>Branch (optional)
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All branches (org account)</option>
              {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label>Account no. (optional)
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Statement account number" />
        </label>
        <label className="span-all">Statement file (.xlsx / .xls)
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
        </label>
      </div>
      {error && <div className="error-box" style={{ marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={!file || upload.isPending} onClick={() => { setError(''); upload.mutate(); }}>
          {upload.isPending ? <><Loader size={15} /> Uploading…</> : <><Upload size={15} /> Upload & auto-match</>}
        </button>
      </div>
    </Card>
  );
}

// ── Statement detail: lines + match / unmatch ────────────────────────────────
function StatementDetailModal({
  statementId, canManage, onClose, onChanged,
}: {
  statementId: string; canManage: boolean; onClose: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [matching, setMatching] = useState<BankStatementLine | null>(null);

  const detailKey = `/reconciliation/statements/${statementId}`;
  const { data, isLoading } = useQuery({
    queryKey: [detailKey],
    queryFn: () => api.get(detailKey).then((r) => r.data.data as BankStatement),
  });
  const refetchDetail = () => {
    void qc.invalidateQueries({ queryKey: [detailKey] });
    onChanged();
  };

  const unmatch = useMutation({
    mutationFn: (lineId: string) => api.post('/reconciliation/unmatch', { lineId }),
    onSuccess: () => { toast.success('Statement line unmatched.'); refetchDetail(); },
    onError: (err) => toast.error(apiMessage(err, 'Could not unmatch the line.')),
  });

  const lines = data?.lines ?? [];

  return (
    <Modal
      size="lg"
      onClose={onClose}
      icon={<Landmark size={20} />}
      title={data ? `${data.bank} statement` : 'Bank statement'}
      subtitle={data ? `${data.branch?.name ?? 'All branches'}${data.periodStart && data.periodEnd ? ` · ${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}` : ''} · ${data.matchedCount}/${data.lineCount} matched` : undefined}
      headerAside={data && <Badge tone={data.status === 'RECONCILED' ? 'success' : 'warning'}>{data.status === 'RECONCILED' ? 'Reconciled' : 'Open'}</Badge>}
      footer={<button onClick={onClose}>Close</button>}
    >
      {isLoading ? (
        <p className="muted">Loading statement…</p>
      ) : lines.length === 0 ? (
        <p className="muted">No lines were parsed from this statement.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Ref</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Match</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isCredit = Number(line.credit) > 0;
                return (
                  <tr key={line.id}>
                    <td>{fmtDate(line.txnDate)}</td>
                    <td>{line.description ?? <span className="muted sm-text">—</span>}</td>
                    <td className="sm-text">{line.reference ?? '—'}</td>
                    <td>{money(line.debit)}</td>
                    <td>{money(line.credit)}</td>
                    <td>{money(line.balance)}</td>
                    <td>
                      {isCredit ? (
                        <>
                          <Badge tone={MATCH_STATUS_TONE[line.matchStatus]}>{MATCH_STATUS_LABEL[line.matchStatus]}</Badge>
                          {line.matchedDeposit && (
                            <div className="muted sm-text">slip {line.matchedDeposit.slipNumber ?? '—'} · {fmtDate(line.matchedDeposit.depositDate)}</div>
                          )}
                        </>
                      ) : (
                        <span className="muted sm-text">—</span>
                      )}
                    </td>
                    <td>
                      {canManage && isCredit && line.matchStatus === 'UNMATCHED' && (
                        <button type="button" className="sm" onClick={() => setMatching(line)}><Check size={14} /> Match</button>
                      )}
                      {canManage && line.matchStatus !== 'UNMATCHED' && (
                        <button type="button" className="sm ghost danger" disabled={unmatch.isPending} onClick={() => unmatch.mutate(line.id)}><Ban size={14} /> Unmatch</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {matching && data && (
        <MatchLineModal
          line={matching}
          bank={data.bank}
          onClose={() => setMatching(null)}
          onMatched={() => { setMatching(null); refetchDetail(); }}
        />
      )}
    </Modal>
  );
}

// ── Pick a deposit to match a statement line to ──────────────────────────────
function MatchLineModal({
  line, bank, onClose, onMatched,
}: {
  line: BankStatementLine; bank: DepositBank; onClose: () => void; onMatched: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string>('');

  // Candidate deposits: same bank, still in transit. Exact-amount matches first.
  const deposits = useQuery({
    queryKey: [`/reconciliation/deposits?status=DEPOSITED&bank=${bank}&pageSize=100`],
    queryFn: () => api.get(`/reconciliation/deposits?status=DEPOSITED&bank=${bank}&pageSize=100`).then((r) => r.data.data as BankDeposit[]),
  });
  const credit = Number(line.credit);
  const candidates = [...(deposits.data ?? [])].sort((a, b) => {
    const ax = Number(a.amount) === credit ? 0 : 1;
    const bx = Number(b.amount) === credit ? 0 : 1;
    return ax - bx;
  });

  const match = useMutation({
    mutationFn: () => api.post('/reconciliation/match', { lineId: line.id, depositId: selected }),
    onSuccess: () => { toast.success('Line matched to the deposit.'); onMatched(); },
    onError: (err) => toast.error(apiMessage(err, 'Could not match the line.')),
  });

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Check size={20} />}
      title="Match statement line"
      subtitle={`${fmtDate(line.txnDate)} · credit ${inr(credit)} · pick the deposit this credit confirms.`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!selected || match.isPending} onClick={() => match.mutate()}>
            {match.isPending ? 'Matching…' : 'Match'}
          </button>
        </>
      }
    >
      {deposits.isLoading ? (
        <p className="muted">Loading deposits…</p>
      ) : candidates.length === 0 ? (
        <p className="muted">No in-transit {bank} deposits to match. Record the deposit on the Bank Deposits screen first.</p>
      ) : (
        <div className="radio-list" style={{ display: 'grid', gap: 8 }}>
          {candidates.map((d) => {
            const exact = Number(d.amount) === credit;
            return (
              <label key={d.id} className="check" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <input type="radio" name="deposit" value={d.id} checked={selected === d.id} onChange={() => setSelected(d.id)} />
                <span style={{ flex: 1 }}>
                  <strong className="num">{inr(d.amount)}</strong>
                  {exact && <Badge tone="success">Exact</Badge>}
                  <div className="muted sm-text">{fmtDate(d.depositDate)} · {d.branch?.name ?? '—'} · slip {d.slipNumber ?? '—'}</div>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
