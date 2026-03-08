import type { AppSettings } from '../../types'
import PatternReview from './PatternReview'

interface Props { settings: AppSettings }

export default function TrophyRoom({ settings }: Props) {
  return <PatternReview settings={settings} />
}
