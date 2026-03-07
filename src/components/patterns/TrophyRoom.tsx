import type { AppSettings } from '../../types'
interface Props { settings: AppSettings }
export default function TrophyRoom({ settings: _s }: Props) {
  return <div className="p-4 th-text">Loading Trophy Room…</div>
}
