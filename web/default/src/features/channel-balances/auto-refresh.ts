export const channelBalancePageRefreshMs = 60 * 1000

export function getChannelBalancePageRefreshMs(autoRefreshMinutes: number) {
  return autoRefreshMinutes > 0 ? channelBalancePageRefreshMs : 0
}

export function getChannelBalanceActiveRefreshMs(autoRefreshMinutes: number) {
  return autoRefreshMinutes > 0 ? autoRefreshMinutes * 60 * 1000 : 0
}
