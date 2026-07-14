import { SVGProps } from 'react';

/**
 * Single shared icon set (Lucide outline paths, MIT) so every icon in the app
 * has the same stroke weight, sizing and alignment. Use these instead of
 * unicode glyphs (▾ ▲ ✓ ×) or ad-hoc inline SVGs.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 16, ...props }: IconProps): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>
);
export const ChevronUp = (p: IconProps) => (
  <svg {...base(p)}><path d="m18 15-6-6-6 6" /></svg>
);
export const ChevronsUpDown = (p: IconProps) => (
  <svg {...base(p)}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
);
export const ArrowUp = (p: IconProps) => (
  <svg {...base(p)}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
);
export const ArrowDown = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
);
export const ArrowRight = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
);
export const Pencil = (p: IconProps) => (
  <svg {...base(p)}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>
);
export const Trash2 = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
);
export const X = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
export const Check = (p: IconProps) => (
  <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const CheckCircle = (p: IconProps) => (
  <svg {...base(p)}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
);
export const AlertCircle = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
);
export const Search = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
export const Upload = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
);
export const Download = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
export const FileSpreadsheet = (p: IconProps) => (
  <svg {...base(p)}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M8 13h2" /><path d="M14 13h2" /><path d="M8 17h2" /><path d="M14 17h2" /></svg>
);
export const Plus = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
export const LogOut = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
export const LayoutDashboard = (p: IconProps) => (
  <svg {...base(p)}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
);
export const Users = (p: IconProps) => (
  <svg {...base(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const UserCheck = (p: IconProps) => (
  <svg {...base(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>
);
export const CalendarCheck = (p: IconProps) => (
  <svg {...base(p)}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>
);
export const CalendarOff = (p: IconProps) => (
  <svg {...base(p)}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m10 15 4 4" /><path d="m14 15-4 4" /></svg>
);
export const Wallet = (p: IconProps) => (
  <svg {...base(p)}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
);
export const Banknote = (p: IconProps) => (
  <svg {...base(p)}><rect width="20" height="12" x="2" y="6" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>
);
export const Landmark = (p: IconProps) => (
  <svg {...base(p)}><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></svg>
);
export const Target = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
);
export const ListChecks = (p: IconProps) => (
  <svg {...base(p)}><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></svg>
);
export const HandCoins = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" /><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /><path d="m2 16 6 6" /><circle cx="16" cy="9" r="2.9" /><circle cx="6" cy="5" r="3" /></svg>
);
export const Briefcase = (p: IconProps) => (
  <svg {...base(p)}><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
);
export const Settings2 = (p: IconProps) => (
  <svg {...base(p)}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
);
export const Loader = (p: IconProps) => (
  <svg {...base(p)} className={`spin${p.className ? ` ${p.className}` : ''}`}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
);
export const Eye = (p: IconProps) => (
  <svg {...base(p)}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const EyeOff = (p: IconProps) => (
  <svg {...base(p)}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
);
