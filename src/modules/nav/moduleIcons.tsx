import { ReactNode } from 'react';
import type { ModuleGroup, ModuleKey } from '../auth/permissions';
import {
  AlertCircle, Banknote, CalendarCheck, CalendarOff, FileSpreadsheet, HandCoins,
  Landmark, LayoutDashboard, ListChecks, LogOut, Settings2, Target, UserCheck,
  Users, Wallet, Briefcase,
} from '../../components/icons';

/**
 * One icon per navigation module so the sidebar reads at a glance. Shared with
 * the command palette so a module looks identical wherever it is listed.
 */
export const MODULE_ICONS: Record<ModuleKey, ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  hrDashboard: <Briefcase size={18} />,
  employees: <Users size={18} />,
  employeeImport: <FileSpreadsheet size={18} />,
  attendance: <CalendarCheck size={18} />,
  attendanceRequests: <ListChecks size={18} />,
  holidays: <CalendarOff size={18} />,
  leave: <CalendarOff size={18} />,
  payroll: <Wallet size={18} />,
  salaryAdvances: <HandCoins size={18} />,
  hrPolicy: <Settings2 size={18} />,
  orgChart: <UserCheck size={18} />,
  shifts: <CalendarCheck size={18} />,
  exit: <LogOut size={18} />,
  announcements: <AlertCircle size={18} />,
  hrPolicyLibrary: <FileSpreadsheet size={18} />,
  masters: <Settings2 size={18} />,
  reports: <FileSpreadsheet size={18} />,
  employeeLoans: <Banknote size={18} />,
  branches: <Landmark size={18} />,
  loans: <ListChecks size={18} />,
  loanLink: <UserCheck size={18} />,
  applications: <ListChecks size={18} />,
  leads: <Target size={18} />,
  collections: <HandCoins size={18} />,
  collectionImport: <FileSpreadsheet size={18} />,
  collectionRecords: <ListChecks size={18} />,
  collectionSettlement: <Landmark size={18} />,
  settlements: <HandCoins size={18} />,
  bankDeposits: <Banknote size={18} />,
  bankReconciliation: <Landmark size={18} />,
  users: <UserCheck size={18} />,
  documents: <FileSpreadsheet size={18} />,
  settings: <Settings2 size={18} />,
};

/** One icon per collapsible menu group (Overview items render as top-level links). */
export const GROUP_ICONS: Record<ModuleGroup, ReactNode> = {
  overview: <LayoutDashboard size={18} />,
  hr: <Users size={18} />,
  finance: <Wallet size={18} />,
  operations: <Landmark size={18} />,
  insights: <FileSpreadsheet size={18} />,
  admin: <Settings2 size={18} />,
};
