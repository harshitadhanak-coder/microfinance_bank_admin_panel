import { FormHTMLAttributes, ReactNode } from 'react';

/**
 * Shared Form/Field abstraction so validation display, required-marking, error
 * placement and help text are consistent everywhere — replacing hand-rolled
 * native inputs in a forced 3-column grid.
 *
 *   <Form onSubmit={…}>
 *     <FormSection title="Identity">
 *       <FormGrid>
 *         <Field label="First name" required error={errors.first}>
 *           <input value={…} onChange={…} />
 *         </Field>
 *         <Field label="Notes" full><textarea … /></Field>
 *       </FormGrid>
 *     </FormSection>
 *     <FormActions>…</FormActions>
 *   </Form>
 */
export function Form({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className="form" {...props}>{children}</form>;
}

/** Grouped fieldset with a section heading — for complex, sectioned entities. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="form-section">
      <legend className="form-section-legend">{title}</legend>
      {description && <p className="form-section-desc">{description}</p>}
      {children}
    </fieldset>
  );
}

/** Responsive field grid: 1 col on narrow, up to `cols` (default 2) when wide. */
export function FormGrid({ cols = 2, children }: { cols?: 1 | 2 | 3; children: ReactNode }) {
  return <div className={`form-grid2 cols-${cols}`}>{children}</div>;
}

export function Field({
  label,
  htmlFor,
  required,
  error,
  help,
  full,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: ReactNode;
  help?: ReactNode;
  /** Span the full width of the grid (long text / selects). */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${full ? ' field-full' : ''}${error ? ' field-invalid' : ''}`}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}{required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {help && !error && <span className="field-help">{help}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** Right-aligned action row (Cancel + primary), pinned in page/modal footers. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}
