/** Calls per wallet confirmation when the wallet batches — `toastifySendCallsTx` sends 10 at a time. */
export const TRANSFERS_PER_CONFIRMATION = 10;

/** How many times the wallet asks the user to confirm moving `count` tokens out of it. */
export const transferConfirmations = (count: number, batches: boolean) =>
  batches ? Math.ceil(count / TRANSFERS_PER_CONFIRMATION) : count;
