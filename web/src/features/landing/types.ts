export type TrialLeadVolume = 'lt_1k' | '1k_10k' | 'gt_10k'

export type TrialLeadPayload = {
  company: string
  contact: string
  volume: TrialLeadVolume
}
