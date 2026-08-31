import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Skeleton } from '../../components/Skeleton';
import { HandCoins, Search, X } from '../../components/icons';
import { apiMessage, fmtDate, inr, isoLocalDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { DayCloseStatus, SettlementDeposit, settlementStatusLabel } from './shared';

/** One selectable staff member, with that date's settlement status alongside. */
interface StaffRow {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  branch: { id: string; name: string } | null;
  role: { name: string; key: string | null; displayName: string | null } | null;
  isFieldOfficer: boolean;
  settlement: {
    id: string;
    status: DayCloseStatus;
    totalCashCollected: string;
    totalCashDeposited: string;
    closingBalance: string;
    submittedAt: string | null;
  } | null;
}

/** Opening balance, reference figures and any settlement already on file. */
interface Worksheet {
  employee: { id: string; fullName: string; employeeCode: string; designation: string; branch: { id: string; name: string } | null };
  businessDate: string;
  openingBalance: number;
  openingCarryForward: number;
  openingCarriedDifference: number;
  cashCollected: number;
  collectedAmount: number;
  targetAmount: number;
  locked: boolean;
  settlement: {
    id: string;
    status: DayCloseStatus;
    hospicash: string;
    totalCashCollected: string;
    axisDeposit: string;
    sbiDeposit: string;
    hdfcDeposit: string;
    depositReference: string | null;
    remarks: string | null;
    deposits: SettlementDeposit[];
  } | null;
}

type DepositBank = 'AXIS' | 'SBI' | 'HDFC';
const DEPOSIT_BANKS: DepositBank[] = ['AXIS', 'SBI', 'HDFC'];

interface DepositDraft {
  bank: DepositBank;
  amount: string;
  slipNumber: string;
}

/** Parses a money field; empty → 0, two-decimal precision. */
const money = (value: string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prefer the saved itemised deposits; fall back to one row per non-zero bank
 *  total so opening a legacy settlement to edit never drops a deposit. */
const depositsFrom = (s: NonNullable<Worksheet['settlement']>): DepositDraft[] => {
  if (s.deposits?.length) {
    return s.deposits.map((d) => ({ bank: d.bank, amount: String(Number(d.amount)), slipNumber: d.slipNumber ?? '' }));
  }
  const byBank: Record<DepositBank, string> = { AXIS: s.axisDeposit, SBI: s.sbiDeposit, HDFC: s.hdfcDeposit };
  return DEPOSIT_BANKS.filter((b) => Number(byBank[b]) > 0).map((b) => ({ bank: b, amount: String(Number(byBank[b])), slipNumber: '' }));
};

/** Neutral placeholder rows while a list or worksheet loads. */
function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="sse-loading" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={18} />)}
    </div>
  );
}

/** Rupee input with a leading ₹ — the same money field the field app uses. */
function MoneyInput({
  label, value, onChange, hint, readOnly, autoValue,
}: {
  label: string; value?: string; onChange?: (v: string) => void; hint?: string; readOnly?: boolean; autoValue?: number;
}) {
  return (
    <label className="sse-amount-field">
      {label}
      <div className={`sse-amount-box${readOnly ? ' sse-amount-readonly' : ''}`}>
        <span aria-hidden="true">₹</span>
        {readOnly ? (
          <input value={new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(autoValue ?? 0)} readOnly tabIndex={-1} />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0"
          />
        )}
      </div>
      {hint && <span className="muted sm-text">{hint}</span>}
    </label>
  );
}

/** Editable list of the day's bank pay-ins; several per bank accumulate. */
function DepositList({ deposits, onChange, total }: { deposits: DepositDraft[]; onChange: (n: DepositDraft[]) => void; total: number }) {
  const update = (i: number, patch: Partial<DepositDraft>) => onChange(deposits.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  return (
    <div className="sse-deposits">
      {deposits.length === 0 ? (
        <p className="muted sm-text sse-deposits-empty">No deposits added yet. Add a row for each bank pay-in, or leave empty if nothing was deposited.</p>
      ) : (
        <div className="sse-deposit-rows">
          {deposits.map((d, i) => (
            <div className="sse-deposit-row" key={i}>
              <label>
                <span className="sse-cell-label">Bank</span>
                <select value={d.bank} onChange={(e) => update(i, { bank: e.target.value as DepositBank })}>
                  {DEPOSIT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label>
                <span className="sse-cell-label">Amount</span>
                <div className="sse-amount-box sse-amount-sm">
                  <span aria-hidden="true">₹</span>
                  <input value={d.amount} onChange={(e) => update(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0" />
                </div>
              </label>
              <label>
                <span className="sse-cell-label">Slip / ref (optional)</span>
                <input value={d.slipNumber} onChange={(e) => update(i, { slipNumber: e.target.value })} maxLength={100} placeholder="Slip no." />
              </label>
              <button type="button" className="ghost sm" aria-label={`Remove deposit ${i + 1}`} onClick={() => onChange(deposits.filter((_, idx) => idx !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="sse-deposit-foot">
        <button type="button" className="ghost sm" onClick={() => onChange([...deposits, { bank: 'AXIS', amount: '', slipNumber: '' }])}>+ Add deposit</button>
        <div className="sse-deposit-total"><span className="muted sm-text">Total deposited</span><strong className="num">{inr(total)}</strong></div>
      </div>
    </div>
  );
}

/**
 * File Staff Settlement — a branch manager keys a staff member's Day-End
 * Settlement from the admin panel.
 *
 * Field officers normally file their own cash book from the field app. When an
 * officer is out of network, has no device, or hands the book over at the
 * counter, the manager picks them from their branch list and enters the same
 * three steps: money in, bank deposits out, reference. What is filed here is
 * the *same* DayClose record with the same lifecycle — it lands as SUBMITTED
 * and is then verified and approved on the Day-End Settlements screen — so the
 * cash trail reads identically no matter who keyed it.
 */
export default function StaffSettlementEntryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [date, setDate] = useState(() => isoLocalDate(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Cash-book form. Opening balance is never held here: it carries forward
  // from the previous approved settlement and is shown read-only, exactly as in
  // the field app, so a manager cannot key an opening balance by hand.
  const [collectionInput, setCollectionInput] = useState('');
  const [hospicash, setHospicash] = useState('0');
  const [deposits, setDeposits] = useState<DepositDraft[]>([]);
  const [depositReference, setDepositReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const staffQuery = useQuery({
    queryKey: ['/collections/day-close/staff', date, search],
    queryFn: () =>
      api
        .get('/collections/day-close/staff', { params: { date, ...(search ? { search } : {}) } })
        .then((r) => r.data.data as StaffRow[]),
  });
  const staff = staffQuery.data ?? [];

  const worksheetQuery = useQuery({
    queryKey: ['/collections/day-close/staff', selectedId, date],
    queryFn: () =>
      api.get(`/collections/day-close/staff/${selectedId}`, { params: { date } }).then((r) => r.data.data as Worksheet),
    enabled: !!selectedId,
  });
  const worksheet = worksheetQuery.data;

  // Prefill from the settlement already on file (draft, submitted or rejected)
  // so the manager corrects it rather than silently starting a blank one.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!worksheet) return;
    const key = `${worksheet.employee.id}:${worksheet.businessDate}:${worksheet.settlement?.id ?? 'new'}`;
    if (prefilledFor.current === key) return;
    prefilledFor.current = key;
    const s = worksheet.settlement;
    setError('');
    if (s) {
      setCollectionInput(Number(s.totalCashCollected) ? String(Number(s.totalCashCollected)) : '');
      setHospicash(String(Number(s.hospicash)));
      setDeposits(depositsFrom(s));
      setDepositReference(s.depositReference ?? '');
      setRemarks(s.remarks ?? '');
    } else {
      setCollectionInput('');
      setHospicash('0');
      setDeposits([]);
      setDepositReference('');
      setRemarks('');
    }
  }, [worksheet]);

  // ── Live cash book: opening + collection + hospicash − deposits = closing.
  const opening = worksheet?.openingBalance ?? 0;
  const collectionAmt = money(collectionInput);
  const hospi = money(hospicash);
  const entries = deposits
    .map((d) => ({ bank: d.bank, amount: money(d.amount), slipNumber: d.slipNumber.trim() }))
    .filter((d) => d.amount > 0);
  const bankTotal = (bank: DepositBank) => round2(entries.filter((d) => d.bank === bank).reduce((sum, d) => sum + d.amount, 0));
  const axisAmt = bankTotal('AXIS');
  const sbiAmt = bankTotal('SBI');
  const hdfcAmt = bankTotal('HDFC');
  const totalDeposit = round2(axisAmt + sbiAmt + hdfcAmt);
  const cashOnHand = round2(opening + collectionAmt + hospi);
  const closingBalance = round2(cashOnHand - totalDeposit);
  const over = totalDeposit > cashOnHand;

  const validationError = useMemo(() => {
    for (const [name, v] of [['Collection', collectionInput], ['Hospicash', hospicash]] as const) {
      if (v.trim() === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) return `${name} must be a valid amount, e.g. 12500 or 12500.50.`;
      if (n < 0) return `${name} cannot be negative.`;
      if (n > 100_000_000) return `${name} looks too large. Re-check the figure.`;
    }
    for (let i = 0; i < deposits.length; i++) {
      const raw = deposits[i]!.amount.trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) return `Deposit #${i + 1} must be a valid amount, e.g. 5000.`;
      if (n <= 0) return `Deposit #${i + 1} must be greater than zero, or remove the row.`;
      if (n > 100_000_000) return `Deposit #${i + 1} looks too large. Re-check the figure.`;
    }
    if (over) return 'Total deposit cannot exceed the cash on hand.';
    return null;
  }, [collectionInput, hospicash, deposits, over]);

  const file = useMutation({
    mutationFn: async (asDraft: boolean) => {
      const { data } = await api.post('/collections/day-close/on-behalf', {
        employeeId: selectedId,
        businessDate: date,
        totalCashCollected: collectionAmt,
        hospicash: hospi,
        deposits: entries.map((d) => ({ bank: d.bank, amount: d.amount, slipNumber: d.slipNumber || undefined })),
        depositReference: depositReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        asDraft: asDraft || undefined,
      });
      return data.message as string;
    },
    onSuccess: (message) => {
      toast.success(message ?? 'Settlement filed.');
      setConfirming(false);
      prefilledFor.current = null;
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/collections/day-close') });
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/collections/settlements') });
    },
    onError: (err) => {
      const message = apiMessage(err, 'Could not file the settlement.');
      setError(message);
      toast.error(message);
      setConfirming(false);
    },
  });

  const startSubmit = () => {
    setError('');
    if (validationError) { setError(validationError); return; }
    setConfirming(true);
  };
  const saveDraft = () => {
    setError('');
    if (validationError) { setError(validationError); return; }
    file.mutate(true);
  };

  const selected = staff.find((s) => s.id === selectedId) ?? null;
  const locked = worksheet?.locked ?? false;
  const status = worksheet?.settlement?.status ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Day-End Settlements', to: '/settlements' }, { label: 'File for staff' }]}
        title="File Staff Settlement"
        subtitle={<>Key a staff member's day-end cash book on their behalf{user?.branch ? ` — ${user.branch.name}` : ''}</>}
        actions={<button className="ghost" onClick={() => navigate('/settlements')}><HandCoins size={15} /> Review settlements</button>}
      />

      <div className="sse-layout">
        {/* ── Who the settlement is for ─────────────────────────────────── */}
        <aside className="panel sse-staff">
          <div className="sse-staff-head">
            <label className="sse-date">Business date
              <input type="date" value={date} max={isoLocalDate(new Date())} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="sse-search">Staff member
              <span className="sse-search-box">
                <Search size={14} />
                <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or code…" />
              </span>
            </label>
          </div>

          {staffQuery.isLoading ? (
            <LoadingRows rows={6} />
          ) : staff.length === 0 ? (
            <p className="muted sm-text pad">No staff found for this branch.</p>
          ) : (
            <ul className="sse-staff-list">
              {staff.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`sse-staff-row${s.id === selectedId ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                    aria-current={s.id === selectedId}
                  >
                    <span className="sse-staff-name">
                      <strong>{s.fullName}</strong>
                      <span className="muted sm-text">{s.employeeCode} · {s.designation}</span>
                    </span>
                    {s.settlement
                      ? <Badge status={s.settlement.status} />
                      : <span className="muted sm-text">Not filed</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── The cash book itself ──────────────────────────────────────── */}
        {!selected ? (
          <section className="panel pad sse-placeholder">
            <HandCoins size={22} />
            <h2>Select a staff member</h2>
            <p className="muted">
              Pick a name on the left to open their cash book for {fmtDate(date)}. Filing here sends the settlement for
              verification exactly as if the officer had submitted it from the field app.
            </p>
          </section>
        ) : worksheetQuery.isLoading || !worksheet ? (
          <section className="panel pad"><LoadingRows rows={5} /></section>
        ) : (
          <section className="sse-book">
            <div className="panel pad sse-form">
              <div className="sse-form-head">
                <div>
                  <h2>Cash book — {worksheet.employee.fullName}</h2>
                  <p className="muted sm-text">Balance the day in three steps. The running total updates on the right.</p>
                </div>
                <div className="sse-chips">
                  <span className="sse-chip"><span>Date</span><strong>{fmtDate(worksheet.businessDate)}</strong></span>
                  <span className="sse-chip"><span>Branch</span><strong>{worksheet.employee.branch?.name ?? '—'}</strong></span>
                  <span className="sse-chip"><span>Code</span><strong>{worksheet.employee.employeeCode}</strong></span>
                </div>
              </div>

              {locked && (
                <div className="info-box">
                  This settlement is {String(settlementStatusLabel[status ?? ''] ?? status).toLowerCase()} by the branch and can no longer be changed.
                </div>
              )}
              {!locked && status === 'REJECTED' && (
                <div className="info-box">Rejected earlier — correct the figures below and file it again.</div>
              )}
              {!locked && status === 'SUBMITTED' && (
                <div className="info-box">Already submitted. Re-filing replaces the figures and sends it back for a fresh review.</div>
              )}

              <fieldset className="sse-group" disabled={locked}>
                <div className="sse-group-head">
                  <span className="sse-step">1</span>
                  <div>
                    <h3>Money in</h3>
                    <p className="muted sm-text">Cash carried forward, what was collected today, plus any hospicash.</p>
                  </div>
                </div>
                <div className="sse-fields">
                  <MoneyInput
                    label="Opening balance"
                    readOnly
                    autoValue={opening}
                    hint={worksheet.openingCarriedDifference > 0 ? 'Unreconciled amount carried from a rejected settlement' : 'Carried forward automatically — not editable'}
                  />
                  <MoneyInput label="Today's collection" value={collectionInput} onChange={setCollectionInput} hint={`Recorded cash receipts: ${inr(worksheet.cashCollected)}`} />
                  <MoneyInput label="Hospicash" value={hospicash} onChange={setHospicash} hint="Leave 0 if none" />
                </div>
              </fieldset>

              <fieldset className="sse-group" disabled={locked}>
                <div className="sse-group-head">
                  <span className="sse-step">2</span>
                  <div>
                    <h3>Money out — bank deposits</h3>
                    <p className="muted sm-text">Add a row for every pay-in. Several deposits — even into the same bank — all add up.</p>
                  </div>
                </div>
                <DepositList deposits={deposits} onChange={setDeposits} total={totalDeposit} />
              </fieldset>

              <fieldset className="sse-group" disabled={locked}>
                <div className="sse-group-head">
                  <span className="sse-step">3</span>
                  <div>
                    <h3>Reference &amp; notes</h3>
                    <p className="muted sm-text">Optional — the deposit slip number and anything worth recording.</p>
                  </div>
                </div>
                <div className="sse-fields sse-fields-2">
                  <label>Deposit reference
                    <input value={depositReference} onChange={(e) => setDepositReference(e.target.value)} maxLength={100} placeholder="Deposit slip / bank receipt no." />
                  </label>
                  <label>Remarks
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} rows={2} placeholder="Anything worth recording" />
                  </label>
                </div>
              </fieldset>

              {error && <div className="error-box">{error}</div>}
            </div>

            {/* Live ledger + actions */}
            <aside className="sse-rail">
              <div className="panel sse-ledger">
                <div className="sse-ledger-head">Cash book summary<span>{fmtDate(worksheet.businessDate)}</span></div>
                <div className="sse-ledger-body">
                  <div className="sse-ledger-row"><span>Opening balance</span><span className="num">{inr(opening)}</span></div>
                  <div className="sse-ledger-row"><span>Cash collection</span><span className="num">+ {inr(collectionAmt)}</span></div>
                  <div className="sse-ledger-row"><span>Hospicash</span><span className="num">+ {inr(hospi)}</span></div>
                  <div className="sse-ledger-rule" />
                  <div className="sse-ledger-row is-total"><span>Cash on hand</span><span className="num">{inr(cashOnHand)}</span></div>
                  {axisAmt > 0 && <div className="sse-ledger-row is-dim"><span>AXIS deposit</span><span className="num">− {inr(axisAmt)}</span></div>}
                  {sbiAmt > 0 && <div className="sse-ledger-row is-dim"><span>SBI deposit</span><span className="num">− {inr(sbiAmt)}</span></div>}
                  {hdfcAmt > 0 && <div className="sse-ledger-row is-dim"><span>HDFC deposit</span><span className="num">− {inr(hdfcAmt)}</span></div>}
                  <div className="sse-ledger-row is-total"><span>Total deposited</span><span className="num">− {inr(totalDeposit)}</span></div>
                  <div className={`sse-closing${over ? ' is-err' : ''}`}>
                    <span className="sse-closing-k">Closing balance</span>
                    <span className="sse-closing-v num">{inr(closingBalance)}</span>
                    <span className="sse-closing-note">{over ? 'Deposits exceed cash on hand — re-check the figures' : 'Carried forward to the next day'}</span>
                  </div>
                </div>
              </div>

              {!locked && (
                <div className="sse-cta">
                  <button type="button" disabled={!!validationError || file.isPending} onClick={startSubmit}>
                    {status === 'REJECTED' ? 'File again' : 'File settlement'}
                  </button>
                  <button type="button" className="ghost" disabled={!!validationError || file.isPending} onClick={saveDraft}>
                    Save as draft
                  </button>
                  <p className="muted sm-text">
                    Opening + Collection + Hospicash − Deposits = Closing. Filing submits it for verification on the
                    Day-End Settlements screen.
                  </p>
                </div>
              )}
            </aside>
          </section>
        )}
      </div>

      {confirming && selected && (
        <ConfirmDialog
          title="File this settlement?"
          message={`This files ${selected.fullName}'s day-end settlement for ${fmtDate(date)} with a closing balance of ${inr(closingBalance)}. It goes to the Day-End Settlements screen for verification.`}
          confirmLabel="File settlement"
          loading={file.isPending}
          onConfirm={() => file.mutate(false)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
