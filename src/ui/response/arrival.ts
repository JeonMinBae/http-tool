/** Last response shown per tab, so a remount (tab switch) does not replay the arrival flash. */
const shown = new Map<string, string>();

export const isNewArrival = (tabId: string, requestId: string) => shown.get(tabId) !== requestId;

export function markArrived(tabId: string, requestId: string) {
  shown.set(tabId, requestId);
}

export function forgetArrival(tabId: string) {
  shown.delete(tabId);
}
