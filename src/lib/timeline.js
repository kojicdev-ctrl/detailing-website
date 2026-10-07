import { TIMELINE } from '../config.js'

const { introEnd, storyEnd, introMinPx } = TIMELINE

// total = ukupan skrol kroz sekciju u px. Tekst ostaje bar introMinPx piksela, čak i kad je skrol kratak.
export const introVisible = (p, total) => p < Math.max(introEnd, total > 0 ? introMinPx / total : 0)

// Ravnomerno: ceo skrol do storyEnd odgovara svim frejmovima, bez obzira na broj frejmova u sekvenci.
export function frameForProgress(p, count) {
  const t = Math.min(1, Math.max(0, p / storyEnd))
  return t * (count - 1)
}
