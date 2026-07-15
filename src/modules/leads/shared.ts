/** Shared types + constants for the Leads module (List, Create/Edit, Details). */

export interface LeadCore {
  id: string;
  fullName: string;
  phoneNumber: string;
  location?: string | null;
  purpose?: string | null;
  requestedAmount?: string | null;
  source?: string | null;
  nextFollowUpAt?: string | null;
}

export interface LeadRow extends LeadCore {
  stage: string;
  assignedTo?: { fullName: string } | null;
  branch: { name: string };
}

export interface LeadActivity {
  id: string; fromStage?: string | null; toStage?: string | null; note?: string | null; createdAt: string;
}

export interface LeadDetail extends LeadCore {
  stage: string;
  branchId: string;
  preScreenPassed?: boolean | null;
  dropReason?: string | null;
  branch: { name: string };
  assignedTo?: { id: string; fullName: string; designation: string } | null;
  loanApplication?: { id: string; applicationNumber: string; status: string } | null;
  activities: LeadActivity[];
}

export interface LeadDocument {
  id: string; documentType: string; fileName: string; isVerified: boolean; createdAt: string;
}

export interface EmployeeOption { id: string; fullName: string; designation: string; branchId?: string | null }
export interface BranchOption { id: string; name: string; code: string }

/** Full stage set (for the list filter + funnel), in pipeline order. */
export const STAGE_ORDER = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED', 'CONVERTED', 'DROPPED'];

/** Forward-only pipeline, mirrored from the backend's PIPELINE_ORDER. */
export const PIPELINE = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED'];

export const stageLabel = (s?: string | null) => (s ?? '').replaceAll('_', ' ');
