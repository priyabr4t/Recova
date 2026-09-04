// All money is BigInt paise. Never floats. BigInt crosses JSON boundaries via
// the express 'json replacer' set in server.ts.

export function rupees(amountPaise: bigint): string {
  return `₹${Number(amountPaise / 100n).toLocaleString('en-IN')}`
}

/** Recovery rate as 0–100 with 2 decimals; 0 when nothing was at risk. */
export function recoveryRate(recoveredPaise: bigint, atRiskPaise: bigint): number {
  if (atRiskPaise === 0n) return 0
  return Math.round((Number(recoveredPaise) / Number(atRiskPaise)) * 10000) / 100
}
