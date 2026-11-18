const wholePercent = 1_000_000;

export function shareAmounts(total: number, shares: { amount: number; percentage: number }[], input: string) {
  const totalCents = Math.round(total * 100);
  const assigned = shares.reduce((sum, share) => sum + Math.round(share.amount * 100), 0);
  const units = shares.reduce((sum, share) => sum + Math.round(share.percentage * 10_000), 0);
  const remaining = totalCents - assigned;
  const remainingPercent = (wholePercent - units) / 10_000;
  const value = Number(input);
  const proposedUnits = Math.round(value * 10_000);
  const preview = Number.isFinite(value) && proposedUnits > 0 && proposedUnits <= wholePercent
    ? Number((BigInt(totalCents) * BigInt(proposedUnits) + 500_000n) / 1_000_000n)
    : null;

  return { assigned, remaining, remainingPercent, preview,
    exceeds: preview !== null && (units + proposedUnits > wholePercent || preview > remaining) };
}
