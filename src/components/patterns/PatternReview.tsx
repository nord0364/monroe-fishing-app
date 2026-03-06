import { useState, useEffect } from 'react'
import type { LandedFish, Session, AppSettings } from '../../types'
import { getLandedFish, getAllSessions } from '../../db/database'
import SizeProgression from './SizeProgression'
import LurePerformance from './LurePerformance'
import TimeWindows from './TimeWindows'
import DepthStructure from './DepthStructure'
import AIChat from './AIChat'

interface Props {
  settings: AppSettings
}

type Tab = 'size' | 'lure' | 'time' | 'depth' | 'chat'

const tabs: { id: Tab; label: string }[] = [
  { id: 'size', label: 'Size' },
  { id: 'lure', label: 'Lure' },
  { id: 'time', label: 'Time' },
  { id: 'depth', label: 'Depth' },
  { id: 'chat', label: '🤖 Chat' },
]

export default function PatternReview({ settings }: Props) {
  const [tab, setTab] = useState<Tab>('size')
  const [fish, setFish] = useState<LandedFish[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [f, s] = await Promise.all([getLandedFish(), getAllSessions()])
    setFish(f)
    setSessions(s)
    setLoading(false)
  }

  const largemouth = fish.filter(f => f.species === 'Largemouth Bass')

  return (
    <div className="flex flex-col pb-24" style={{ minHeight: 'calc(100vh - 60px)' }}>
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-slate-100 mb-1">Pattern Review</h1>
        <p className="text-slate-400 text-xs">{fish.length} total catches · {largemouth.length} largemouth</p>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 px-4 pb-2 scrollbar-hide">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-2">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : fish.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🎣</div>
            <p className="text-slate-400">No catches logged yet.</p>
            <p className="text-slate-500 text-sm mt-1">Start a session to track your catches.</p>
          </div>
        ) : (
          <>
            {tab === 'size' && <SizeProgression fish={fish} settings={settings} />}
            {tab === 'lure' && <LurePerformance fish={fish} settings={settings} />}
            {tab === 'time' && <TimeWindows fish={fish} sessions={sessions} />}
            {tab === 'depth' && <DepthStructure fish={fish} settings={settings} />}
            {tab === 'chat' && <AIChat fish={fish} sessions={sessions} settings={settings} />}
          </>
        )}
      </div>
    </div>
  )
}
