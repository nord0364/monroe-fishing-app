
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LandedFish, Session } from '../../types'

interface Props {
  fish: LandedFish[]
  sessions: Session[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TimeWindows({ fish, sessions }: Props) {
  const lmb = fish.filter(f => f.species === 'Largemouth Bass')

  // Catches by hour of day
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h < 12 ? `${h || 12}${h < 12 ? 'a' : 'p'}` : `${h === 12 ? 12 : h - 12}p`,
    count: lmb.filter(f => new Date(f.timestamp).getHours() === h).length,
    avgWeight: 0,
  }))

  // Fill avg weights
  byHour.forEach((slot, h) => {
    const hourFish = lmb.filter(f => new Date(f.timestamp).getHours() === h)
    if (hourFish.length > 0) {
      slot.avgWeight = +(hourFish.reduce((s, f) => s + f.weightLbs + f.weightOz / 16, 0) / hourFish.length).toFixed(2)
    }
  })

  // Catches by month
  const byMonth = MONTHS.map((month, m) => ({
    month,
    count: lmb.filter(f => new Date(f.timestamp).getMonth() === m).length,
  }))

  // Moon phase correlation (if 30+ entries)
  const moonData = lmb.reduce<Record<string, { count: number; totalWeight: number }>>((acc, f) => {
    // Get moon phase from session
    const session = sessions.find(s => s.id === f.sessionId)
    const phase = session?.conditions?.moonPhase ?? 'Unknown'
    if (!acc[phase]) acc[phase] = { count: 0, totalWeight: 0 }
    acc[phase].count++
    acc[phase].totalWeight += f.weightLbs + f.weightOz / 16
    return acc
  }, {})

  const moonChartData = Object.entries(moonData).map(([phase, d]) => ({
    phase,
    count: d.count,
    avgWeight: +(d.totalWeight / d.count).toFixed(2),
  })).sort((a, b) => b.count - a.count)

  const showMoon = lmb.length >= 30

  return (
    <div className="space-y-5 pb-6">
      {/* Best hours heatmap */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-1 text-sm">Catch Activity by Hour</h3>
        <p className="text-slate-500 text-xs mb-3">Largemouth bass</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={byHour.filter((_, i) => i % 2 === 0)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
            <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Catches" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Average weight by hour */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-1 text-sm">Average Weight by Hour</h3>
        <p className="text-slate-500 text-xs mb-3">Larger fish at certain times of day</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={byHour.filter(d => d.count > 0 && d.avgWeight > 0).filter((_, i) => i % 2 === 0)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="lb" />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
            <Bar dataKey="avgWeight" fill="#10b981" radius={[4, 4, 0, 0]} name="Avg weight" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly catch count */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-3 text-sm">Catches by Month</h3>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Catches" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Moon phase correlation */}
      {showMoon ? (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-3 text-sm">Moon Phase vs Catch Weight</h3>
          <div className="space-y-2">
            {moonChartData.map(d => (
              <div key={d.phase} className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">{d.phase} <span className="text-slate-600">({d.count})</span></span>
                <span className="text-slate-200 text-sm font-medium">{d.avgWeight}lb avg</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-center">
          <p className="text-slate-400 text-sm">🌙 Moon phase correlation</p>
          <p className="text-slate-500 text-xs mt-1">
            Requires 30+ largemouth logged. You have {lmb.length}.
          </p>
        </div>
      )}
    </div>
  )
}
