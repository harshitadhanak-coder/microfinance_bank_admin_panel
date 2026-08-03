import { MapPin } from '../../components/icons';
import { Tooltip } from '../../components/Tooltip';
import { punchCoordinates, punchLocation } from './attendanceShared';

/**
 * One punch's place: a compact single line in the table, the full address on
 * hover.
 *
 * A written address runs to three lines in a table cell, which made one
 * positioned row tower over the nine plain ones around it. So the cell keeps to
 * a single truncated line and the complete address — plus the coordinates it
 * came from — lives in the tooltip.
 *
 * The name is a label and the link is the evidence: a geocoded name is only as
 * precise as the map data behind it, so clicking drops a pin on the recorded
 * coordinates. That is how a manager confirms someone punched at the branch and
 * not thirty kilometres away.
 *
 * Shared by the daily list and the per-employee month view so the two can never
 * describe the same punch differently.
 */
export function PunchPlace({ label, name, latitude, longitude }: {
  /** "In" / "Out" when both punches share a cell; omit when the column says which. */
  label?: string;
  name?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}) {
  const text = punchLocation(name, latitude, longitude);
  if (!text) return <>—</>;
  const coords = punchCoordinates(latitude, longitude);

  const detail = (
    <>
      <span className="tooltip-title">{text}</span>
      {coords && <span className="tooltip-meta">{coords.display}</span>}
      {coords && <span className="tooltip-hint">Click to open this exact position in Maps</span>}
    </>
  );

  const body = (
    <>
      <MapPin size={12} />
      <span className="att-loc-value">{text}</span>
    </>
  );

  return (
    <span className="att-loc-line">
      {label && <span className="att-loc-tag">{label}</span>}
      <Tooltip content={detail} className="att-loc-tip">
        {coords ? (
          <a className="att-loc-link" href={coords.mapUrl} target="_blank" rel="noreferrer">
            {body}
          </a>
        ) : (
          <span className="att-loc-link">{body}</span>
        )}
      </Tooltip>
    </span>
  );
}
