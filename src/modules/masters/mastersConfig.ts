import { ReactNode } from 'react';

/**
 * Shared configuration for the Organization Masters module — the six reference
 * datasets, their table columns and their create/edit form fields. Consumed by
 * the Masters Hub (`/masters`) and each per-resource list page (`/masters/:resource`).
 */

export interface MasterRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  level?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  graceMinutes?: number | null;
  fullDayMinutes?: number | null;
  halfDayMinutes?: number | null;
  departmentId?: string | null;
  department?: { id: string; name: string; code: string } | null;
}

export interface OptionRow { id: string; name: string; code: string }

export type MasterKey =
  | 'departments'
  | 'designations'
  | 'grades'
  | 'employment-types'
  | 'shifts'
  | 'holiday-groups';

export type FieldType = 'text' | 'textarea' | 'number' | 'time' | 'select';
export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  optionsKey?: MasterKey;
  placeholder?: string;
  span?: boolean;
}

/** A rendered extra column: header + a cell renderer (kept plain so config is not JSX). */
export interface ExtraColumn { header: string; render: (r: MasterRow) => ReactNode; sortKey?: string }

export interface MasterDef {
  label: string;
  singular: string;
  description: string;
  extraColumns: ExtraColumn[];
  formFields: FieldDef[];
}

const CODE: FieldDef = { name: 'code', label: 'Code', type: 'text', required: true };
const NAME: FieldDef = { name: 'name', label: 'Name', type: 'text', required: true };
const DESCRIPTION: FieldDef = { name: 'description', label: 'Description', type: 'textarea', placeholder: 'optional', span: true };

const timing = (r: MasterRow): string => (r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : '—');

export const MASTER_CONFIG: Record<MasterKey, MasterDef> = {
  departments: {
    label: 'Departments', singular: 'department',
    description: 'Organizational departments staff are grouped under.',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
  designations: {
    label: 'Designations', singular: 'designation',
    description: 'Job titles, each optionally tied to a department.',
    extraColumns: [{ header: 'Department', render: (r) => r.department?.name ?? '—', sortKey: 'department' }],
    formFields: [CODE, NAME, { name: 'departmentId', label: 'Department', type: 'select', optionsKey: 'departments', required: true, span: true }, DESCRIPTION],
  },
  grades: {
    label: 'Grades', singular: 'grade',
    description: 'Pay/seniority grades with a numeric level.',
    extraColumns: [{ header: 'Level', render: (r) => (r.level ?? '—'), sortKey: 'level' }],
    formFields: [CODE, NAME, { name: 'level', label: 'Level', type: 'number', required: true }, DESCRIPTION],
  },
  'employment-types': {
    label: 'Employment Types', singular: 'employment type',
    description: 'Full-time, contract, probation and similar categories.',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
  shifts: {
    label: 'Shifts', singular: 'shift',
    description: 'Work shifts with timings and attendance thresholds.',
    extraColumns: [{ header: 'Timing', render: (r) => timing(r), sortKey: 'startTime' }],
    formFields: [
      CODE, NAME,
      { name: 'startTime', label: 'Start time', type: 'time', required: true },
      { name: 'endTime', label: 'End time', type: 'time', required: true },
      { name: 'graceMinutes', label: 'Grace (min)', type: 'number' },
      { name: 'fullDayMinutes', label: 'Full day (min)', type: 'number' },
      { name: 'halfDayMinutes', label: 'Half day (min)', type: 'number' },
      DESCRIPTION,
    ],
  },
  'holiday-groups': {
    label: 'Holiday Groups', singular: 'holiday group',
    description: 'Named sets of holidays that can be assigned to branches.',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
};

export const MASTER_ORDER: MasterKey[] = ['departments', 'designations', 'grades', 'employment-types', 'shifts', 'holiday-groups'];

export const isMasterKey = (v: string): v is MasterKey => (MASTER_ORDER as string[]).includes(v);
