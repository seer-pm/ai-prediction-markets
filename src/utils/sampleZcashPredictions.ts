/**
 * Sample Zcash predictions, one row per proposal on the Q3 2026 ballot.
 *
 * The point of this file is the titles: `parseZcashCSV` matches on the exact ballot title, so the
 * sample doubles as the template you edit rather than a set of guesses worth uploading as-is.
 *
 * Every row ships `approved: true` because the prior round approved roughly 55% of proposals, which
 * makes yes the modal answer and a reasonable thing to start from. Flip the ones you would reject,
 * and delete the rows you have no view on — a proposal with no row is never traded.
 */
export const sampleZcashPredictions = [
  { project: "Zcash Grants Hub", approved: true },
  { project: "ShieldedScan", approved: true },
  { project: "ZecKit Post-M3 Stabilization and Developer Adoption", approved: true },
  { project: "zcashtocash via ZcashLabs", approved: true },
  { project: "zec-ironwood-reconcile", approved: true },
  { project: "Gleyo", approved: true },
  { project: "Self-Sovereign Zcash Testnet Faucet", approved: true },
  { project: "CyphZec.com", approved: true },
  { project: "ZecLedger", approved: true },
  { project: "lightwalletd-rs", approved: true },
  { project: "Blindvault", approved: true },
  { project: "Zallet RPC Parity Harness", approved: true },
  { project: "Zecmap", approved: true },
  { project: "Connaugh Zcash Videos", approved: true },
  { project: "ZAP1 Attestation Protocol and Verification Tooling", approved: true },
  { project: "ZecBooks", approved: true },
  { project: "CipherPay", approved: true },
  { project: "Zafu Browser Extension", approved: true },
  { project: "Zapp", approved: true },
  { project: "Open-Source Zcash Hardware-Wallet SDK", approved: true },
  { project: "Nozy Wallet", approved: true },
  { project: "THORSwap / Metro", approved: true },
  { project: "Expanding Zcash In Unstoppable Wallet", approved: true },
  { project: "ZcashNames", approved: true },
  { project: "Frontier Compute Zcash Security Research and Remediation Pack", approved: true },
  { project: "Zebra Critical Vulnerability Bug Bounty (CVE-2026-34202)", approved: true },
  { project: "Bonus Grant - Ironwood zk-SNARK Formal Verification", approved: true },
  { project: "CipherScan", approved: true },
  { project: "Temporary Detectable Unlimited Mint and Sell Exploit", approved: true },
  { project: "Five Critical Zebra Consensus Divergence Vulnerabilities", approved: true },
  { project: "Zec.rocks (16 months of uptime)", approved: true },
  { project: "Ironwood external audit reimbursement", approved: true },
  { project: "Ironwood zk-SNARK Formal Verification (Project Tachyon)", approved: true },
  { project: "Orchard Counterfeiting Vulnerability Bug Bounty", approved: true },
  { project: "Bonus Grant - Orchard Counterfeiting Bug Bounty", approved: true },
  { project: "ValarGroup Ironwood Work", approved: true },
  { project: "ZODL Q1 2026 Core Protocol Development", approved: true },
];
