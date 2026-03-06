
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LandedFish, AppSettings } from '../../types'

interface Props {
  fish: LandedFish[]
  settings: AppSettings
}

export default function SizeProgression({ fish, settings }: Props) {
  const threshold = settings.sizeThresholdLbs ?? 3

  // Personal bests by species
  const bests = fish.reduce<Record<string, LandedFish>>((acc, f) => {
    const total = f.weightLbs + f.weightOz / 16
    const prev = acc[f.species]
    if (!prev || (prev.weightLbs + prev.weightOz / 16) < total) {
      acc[f.species] = f
    }
    return acc
  }, {})

  // Weight over time (largemouth)
  const lmb = fish
    .filter(f => f.species === 'Largemouth Bass')
    .sort((a, b) => a.timestamp - b.timestamp)

  const chartData = lmb.map(f => ({
    date: new Date(f.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: +(f.weightLbs + f.weightOz / 16).toFixed(2),
  }))

  // Rolling average (5-catch)
  const withAvg = chartData.map((d, i, arr) => {
    const window = arr.slice(Math.max(0, i - 4), i + 1)
    const avg = window.reduce((s, x) => s + x.weight, 0) / window.length
    return { ...d, avg: +avg.toFixed(2) }
  })

  const qualityFish = lmb.filter(f => (f.weightLbs + f.weightOz / 16) >= threshold)

  return (
    <div className="space-y-5 pb-6">
      {/* Personal bests */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-3 text-sm">Personal Bests</h3>
        {Object.entries(bests).map(([species, f]) => (
          <div key={species} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
            <div>
              <div className="text-slate-200 text-sm font-medium">{species}</div>
              <div className="text-slate-400 text-xs">{f.lureType} · {new Date(f.timestamp).toLocaleDateString()}</div>
            </div>
            <div className="text-emerald-400 font-bold text-base">
              {f.weightLbs}lb {f.weightOz}oz
            </div>
          </div>
        ))}
      </div>

      {/* Weight distribution chart */}
      {chartData.length >= 3 ? (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-1 text-sm">Largemouth Weight Over Time</h3>
          <p className="text-slate-500 text-xs mb-3">Green line = 5-catch rolling average</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={withAvg}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="lb" />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Line type="monotone" dataKey="weight" stroke="#64748b" strokeWidth={1} dot={{ r: 3, fill: '#64748b' }} name="Weight" />
              <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} dot={false} name="Avg" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-slate-500 text-sm text-center py-4">Log 3+ largemouth to see the trend chart.</p>
      )}

      {/* Quality fish summary */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-1 text-sm">Fish Above {threshold}lb Threshold</h3>
        <p className="text-slate-400 text-3xl font-bold mt-1">{qualityFish.length}</p>
        <p className="text-slate-500 text-xs mt-0.5">of {lmb.length} largemouth logged</p>
        {qualityFish.length > 0 && (
          <div className="mt-3 space-y-1">
            {qualityFish
              .sort((a, b) => (b.weightLbs + b.weightOz / 16) - (a.weightLbs + a.weightOz / 16))
              .slice(0, 5)
              .map(f => (
                <div key={f.id} className="flex justify-between text-sm">
                  <span className="text-slate-400">{f.lureType} · {new Date(f.timestamp).toLocaleDateString()}</span>
                  <span className="text-emerald-400 font-medium">{f.weightLbs}lb {f.weightOz}oz</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
