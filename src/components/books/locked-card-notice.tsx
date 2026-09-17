export function LockedCardNotice({ reason }: { reason: string }) {
  return <p className="field-group__helper">{reason}</p>;
}
