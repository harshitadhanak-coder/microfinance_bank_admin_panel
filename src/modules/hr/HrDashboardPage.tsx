import { ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { CardsSkeleton } from '../../components/Skeleton';
import { Column, DataTable } from '../../components/DataTable';
import { inr } from '../../components/StatCard';
import { ChartLegend, DonutChart, type Slice } from '../../components/Charts';
import { useAuth } from '../auth/AuthContext';
import {
  Banknote, Briefcase, CalendarCheck, CalendarOff, HandCoins, Plus, UserCheck, Users, Wallet,
} from '../../components/icons';

interface CelebrationRow { id: string; fullName: string; employeeCode: string; date: string; inDays: number; years?: number }
interface HrSummary {
  headcount: number; presentToday: number; absentToday: number; lateToday: number; onLeaveToday: number;
  pendingLeaves: number; pendingEmployeeLoans: number; activeEmployeeLoans: number; pendingPayroll: boolean;
  upcomingBirthdays: CelebrationRow[]; upcomingWorkAnniversaries: CelebrationRow[];
}
interface EmployeeRow {
  id: string; fullName: string; designation: string; joiningDate: string;
}
interface LeaveRow {
  id: string; leaveType: string; fromDate: string; toDate: string; numberOfDays: string;
  status: string; createdAt: string; employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}
interface LoanRow {
  id: string; loanNumber: string; status: string; principalAmount: string; requestedAt: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const isoLocal = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
const groupCount = <T,>(items: T[], key: (t: T) => string): Slice[] => {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};
const initials = (name: string): string => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || 'U';
};

function DashCard({ title, icon, linkTo, linkLabel, children }: {
  title: string; icon: ReactNode; linkTo?: string; linkLabel?: string; children: ReactNode;
}) {
  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <h3><span className="card-icon">{icon}</span> {title}</h3>
        {linkTo && <Link className="card-link" to={linkTo}>{linkLabel ?? 'View all'}</Link>}
      </div>
      {children}
    </section>
  );
}

export default function HrDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const summaryQuery = useQuery({
    queryKey: ['/human-resources/dashboard'],
    queryFn: () => api.get('/human-resources/dashboard').then((r) => r.data.data as HrSummary),
  });
  const employeesQuery = useQuery({
    queryKey: ['/employees', 'dash'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeRow[]),
  });
  const leavesQuery = useQuery({
    queryKey: ['/human-resources/leaves', 'dash'],
    queryFn: () => api.get('/human-resources/leaves?pageSize=100').then((r) => r.data.data as LeaveRow[]),
  });
  const loansQuery = useQuery({
    queryKey: ['/employee-loans', 'dash'],
    queryFn: () => api.get('/employee-loans?pageSize=100').then((r) => r.data.data as LoanRow[]),
  });

  const s = summaryQuery.data;
  const employees = employeesQuery.data ?? [];
  const leaves = leavesQuery.data ?? [];
  const loans = loansQuery.data ?? [];
  const attendanceRate = s && s.headcount > 0 ? Math.round((s.presentToday / s.headcount) * 100) : 0;

  const kpis: { label: string; value: number | string; hint: string; to: string; icon: ReactNode; tone: string }[] = [
    { label: 'Active employees', value: s?.headcount ?? '—', hint: 'Across all branches', to: '/employees', icon: <Users size={16} />, tone: '' },
    { label: 'Present today', value: s?.presentToday ?? '—', hint: `${attendanceRate}% of staff`, to: '/attendance', icon: <UserCheck size={16} />, tone: 'green' },
    { label: 'Absent today', value: s?.absentToday ?? '—', hint: `${s?.lateToday ?? 0} arrived late`, to: '/attendance', icon: <CalendarOff size={16} />, tone: 'red' },
    { label: 'On leave today', value: s?.onLeaveToday ?? '—', hint: 'Approved leave', to: '/leave', icon: <CalendarOff size={16} />, tone: 'blue' },
    { label: 'Pending leave approvals', value: s?.pendingLeaves ?? '—', hint: 'Awaiting decision', to: '/leave', icon: <CalendarCheck size={16} />, tone: 'amber' },
    { label: 'Payroll this month', value: s?.pendingPayroll ? 'Pending' : 'Done', hint: s?.pendingPayroll ? 'Not yet run' : 'Processed', to: '/payroll', icon: <Wallet size={16} />, tone: s?.pendingPayroll ? 'amber' : 'green' },
    { label: 'Active staff loans', value: s?.activeEmployeeLoans ?? '—', hint: `${s?.pendingEmployeeLoans ?? 0} pending requests`, to: '/employee-loans', icon: <Banknote size={16} />, tone: 'red' },
  ];

  // Today's attendance split — the single most-glanced HR chart.
  const todaySnapshot = useMemo<Slice[]>(() => {
    const present = s?.presentToday ?? 0;
    const onLeave = s?.onLeaveToday ?? 0;
    const absent = Math.max(0, (s?.headcount ?? 0) - present - onLeave);
    return [
      { label: 'Present', value: present, color: '#1d7a4f' },
      { label: 'On leave', value: onLeave, color: '#a36a10' },
      { label: 'Absent', value: absent, color: '#b3392f' },
    ];
  }, [s]);

  // Workforce composition by role — how the branch (or whole org, for HQ) is
  // staffed. More actionable for a branch manager / super admin than a leave split.
  const teamComposition = useMemo<Slice[]>(() =>
    groupCount(employees, (e) => e.designation || 'Unspecified').slice(0, 6), [employees]);

  const onLeaveToday = useMemo(() => {
    const today = isoLocal(new Date());
    return leaves.filter((l) => l.status === 'APPROVED' && l.fromDate.slice(0, 10) <= today && l.toDate.slice(0, 10) >= today);
  }, [leaves]);

  const pendingLoans = useMemo(() => loans.filter((l) => l.status === 'PENDING').slice(0, 6), [loans]);

  const recentLeaves = useMemo(() =>
    [...leaves].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 25), [leaves]);

  const activities = useMemo(() => {
    type Act = { date: string; icon: ReactNode; text: ReactNode; sub: string };
    const items: Act[] = [];
    for (const l of leaves.slice(0, 25)) items.push({
      date: l.createdAt, icon: <CalendarOff size={13} />,
      text: <><strong>{l.employee.fullName}</strong> applied for {l.leaveType.toLowerCase()} leave</>,
      sub: `${titleCase(l.status)} · ${fmtDate(l.createdAt)}`,
    });
    for (const ln of loans.slice(0, 25)) items.push({
      date: ln.requestedAt, icon: <Banknote size={13} />,
      text: <><strong>{ln.employee.fullName}</strong> requested a staff loan of {inr(ln.principalAmount)}</>,
      sub: `${titleCase(ln.status)} · ${fmtDate(ln.requestedAt)}`,
    });
    for (const e of employees) items.push({
      date: e.joiningDate, icon: <UserCheck size={13} />,
      text: <><strong>{e.fullName}</strong> joined as {e.designation}</>,
      sub: `Onboarded · ${fmtDate(e.joiningDate)}`,
    });
    return items.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 7);
  }, [leaves, loans, employees]);

  const leaveColumns: Column<LeaveRow>[] = [
    { header: 'Employee', render: (l) => <><strong>{l.employee.fullName}</strong><div className="muted sm-text">{l.employee.employeeCode}</div></> },
    { header: 'Type', render: (l) => titleCase(l.leaveType) },
    { header: 'From', render: (l) => fmtDate(l.fromDate) },
    { header: 'To', render: (l) => fmtDate(l.toDate) },
    { header: 'Days', render: (l) => Number(l.numberOfDays) },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{titleCase(l.status)}</span> },
  ];

  const loading = summaryQuery.isLoading || employeesQuery.isLoading;

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>HR Dashboard</h1>
          <p className="muted">Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'} — your people at a glance</p>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => navigate('/employees')}><Plus size={15} /> Add employee</button>
          <button type="button" className="ghost" onClick={() => navigate('/leave')}><CalendarCheck size={15} /> Approve leave</button>
          <button type="button" className="ghost" onClick={() => navigate('/payroll')}><Wallet size={15} /> Process payroll</button>
        </div>
      </header>

      {loading ? (
        <CardsSkeleton count={5} />
      ) : (
        <div className="dash">
          {/* KPI summary */}
          <div className="kpi-grid">
            {kpis.map((k) => (
              <Link key={k.label} to={k.to} className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">{k.label}</span>
                  <span className={`kpi-icon ${k.tone}`}>{k.icon}</span>
                </div>
                <span className="kpi-value">{k.value}</span>
                <span className="kpi-hint">{k.hint}</span>
              </Link>
            ))}
          </div>

          {/* At-a-glance charts */}
          <div className="dash-grid cols-2">
            <DashCard title="Today's attendance" icon={<UserCheck size={16} />} linkTo="/attendance">
              <div className="chart-frame">
                <DonutChart data={todaySnapshot} size={132} centerValue={`${attendanceRate}%`} centerLabel="present" />
                <ChartLegend data={todaySnapshot} />
              </div>
            </DashCard>
            <DashCard title="Team composition" icon={<Briefcase size={16} />} linkTo="/employees">
              {teamComposition.length ? (
                <div className="chart-frame">
                  <DonutChart data={teamComposition} size={132} centerValue={employees.length} centerLabel="staff" />
                  <ChartLegend data={teamComposition} />
                </div>
              ) : <p className="dash-empty">No employees yet.</p>}
            </DashCard>
          </div>

          <div className="dash-2col">
            {/* Left column — leave-centric */}
            <div className="dash-col">
              <DashCard title="Employees on leave today" icon={<CalendarOff size={16} />} linkTo="/leave" linkLabel="View leave">
                {onLeaveToday.length ? (
                  <ul className="person-list">
                    {onLeaveToday.map((l) => (
                      <li key={l.id} className="person-row">
                        <span className="person-av">{initials(l.employee.fullName)}</span>
                        <span className="person-meta">
                          <strong>{l.employee.fullName}</strong>
                          <span className="muted">{titleCase(l.leaveType)} leave{l.employee.branch ? ` · ${l.employee.branch.name}` : ''}</span>
                        </span>
                        <span className="person-tag">until {new Date(l.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dash-empty">Everyone is in today. 🎉</p>}
              </DashCard>

              <DashCard title="Recent leave requests" icon={<CalendarCheck size={16} />} linkTo="/leave">
                <DataTable
                  columns={leaveColumns}
                  rows={recentLeaves}
                  loading={leavesQuery.isLoading}
                  empty="No leave requests found."
                  searchable={false}
                  pageSize={5}
                />
              </DashCard>
            </div>

            {/* Right column — loans + activity */}
            <div className="dash-col">
              <DashCard title="Pending employee loan requests" icon={<HandCoins size={16} />} linkTo="/employee-loans" linkLabel="Review">
                {pendingLoans.length ? (
                  <ul className="person-list">
                    {pendingLoans.map((l) => (
                      <li key={l.id} className="person-row">
                        <span className="person-av">{initials(l.employee.fullName)}</span>
                        <span className="person-meta">
                          <strong>{l.employee.fullName}</strong>
                          <span className="muted"><code>{l.loanNumber}</code> · {fmtDate(l.requestedAt)}</span>
                        </span>
                        <span className="person-tag">{inr(l.principalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dash-empty">No loan requests are awaiting a decision.</p>}
              </DashCard>

              <DashCard title="Upcoming birthdays" icon={<CalendarCheck size={16} />} linkTo="/employees">
                {(s?.upcomingBirthdays ?? []).length ? (
                  <ul className="person-list">
                    {(s?.upcomingBirthdays ?? []).map((b) => (
                      <li key={b.id} className="person-row">
                        <span className="person-av">{initials(b.fullName)}</span>
                        <span className="person-meta">
                          <strong>{b.fullName}</strong>
                          <span className="muted">🎂 {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                        </span>
                        <span className="person-tag">{b.inDays === 0 ? 'Today' : `in ${b.inDays}d`}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dash-empty">No birthdays in the next 30 days.</p>}
              </DashCard>

              <DashCard title="Work anniversaries" icon={<Briefcase size={16} />} linkTo="/employees">
                {(s?.upcomingWorkAnniversaries ?? []).length ? (
                  <ul className="person-list">
                    {(s?.upcomingWorkAnniversaries ?? []).map((a) => (
                      <li key={a.id} className="person-row">
                        <span className="person-av">{initials(a.fullName)}</span>
                        <span className="person-meta">
                          <strong>{a.fullName}</strong>
                          <span className="muted">🎉 {a.years} {a.years === 1 ? 'year' : 'years'} · {new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                        </span>
                        <span className="person-tag">{a.inDays === 0 ? 'Today' : `in ${a.inDays}d`}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dash-empty">No anniversaries in the next 30 days.</p>}
              </DashCard>

              <DashCard title="Recent HR activity" icon={<Users size={16} />}>
                {activities.length ? (
                  <ul className="timeline">
                    {activities.map((a, i) => (
                      <li key={i}>
                        <span className="timeline-icon">{a.icon}</span>
                        <span className="timeline-body">
                          <strong>{a.text}</strong>
                          <span className="muted">{a.sub}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dash-empty">No recent activity.</p>}
              </DashCard>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
