const POSITION_GAP = 65536;

export function getNextPosition(lastPosition: number | undefined): number {
  return (lastPosition ?? 0) + POSITION_GAP;
}

export function getMiddlePosition(before: number | undefined, after: number | undefined): number {
  const low = before ?? 0;
  const high = after ?? low + POSITION_GAP * 2;
  return (low + high) / 2;
}

export function renumberPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_GAP);
}
