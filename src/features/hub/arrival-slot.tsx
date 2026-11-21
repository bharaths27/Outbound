// Slot for Verna's live arrival countdown (contract in PERSON2_HANDOFF.md). Until her
// component lands, it shows an empty countdown. Replace the body, keep the props.

export function ArrivalSlot({ stationId }: { stationId: string }) {
  return (
    <p className="type-small text-muted-foreground tabular-nums" data-station-id={stationId}>
      Next train: —
    </p>
  );
}
