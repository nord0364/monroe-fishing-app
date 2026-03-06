
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LandedFish, AppSettings } from '../../types'

interface Props {
  fish: LandedFish[]
  settings: AppSettings
}

export default function LurePerformance({ fish, settings }: Props) {
  const threshold = settings.sizeThresholdLbs ?? 3
  const lmb = fish.filter(f => f.species === 'Largemouth Bass')
  const quality = lmb.filter(f => f.weightLbs + f.weightOz / 16 >= threshold)

  // Best lure types by quality catch count
  const lureQuality = quality.reduce<Record<string, number>>((acc, f) => {
    acc[f.lureType] = (acc[f.lureType] ?? 0) + 1
    return acc
  }, {})
  const lureQualityData = Object.entries(lureQuality)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lure, count]) => ({ lure, count }))

  // Lure color breakdown by sky condition
  type ByCondition = Record<string, Record<string, number>>
  const colorBySky = quality.reduce<ByCondition>((acc, f) => {
    // We don't have sky per-catch, but we can group by color
    const color = f.lureColor.toLowerCase().trim().split(/\s+/).slice(0, 2).join(' ') || 'unknown'
    if (!acc[color]) acc[color] = { count: 0 }
    acc[color].count = (acc[color].count ?? 0) + 1
    return acc
  }, {})
  const topColors = Object.entries(colorBySky)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)

  // Custom pour vs store bought
  const customCount = quality.filter(f => f.customPour).length
  const storeCount = quality.filter(f => !f.customPour).length

  // Average weight by lure type
  const lureWeights: Record<string, number[]> = {}
  lmb.forEach(f => {
    if (!lureWeights[f.lureType]) lureWeights[f.lureType] = []
    lureWeights[f.lureType].push(f.weightLbs + f.weightOz / 16)
  })
  const avgByLure = Object.entries(lureWeights)
    .map(([lure, weights]) => ({
      lure,
      avg: +(weights.reduce((s, w) => s + w, 0) / weights.length).toFixed(2),
      count: weights.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8)

  return (
    <div className="space-y-5 pb-6">
      {/* Quality catches by lure */}
      {lureQualityData.length > 0 ? (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-1 text-sm">Quality Catches by Lure Type (≥{threshold}lb)</h3>
          <p className="text-slate-500 text-xs mb-3">Largemouth only</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={lureQualityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis dataKey="lure" type="category" tick={{ fontSize: 9, fill: '#94a3b8' }} width={80} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
              <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Catches" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-slate-500 text-sm text-center py-4">No quality catches above {threshold}lb yet.</p>
      )}

      {/* Average weight by lure */}
      {avgByLure.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-3 text-sm">Average Largemouth Weight by Lure</h3>
          <div className="space-y-2">
            {avgByLure.map(item => (
              <div key={item.lure} className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">{item.lure} <span className="text-slate-600">({item.count})</span></span>
                <span className="text-slate-200 text-sm font-medium">{item.avg} lbs avg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top producing colors */}
      {topColors.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-3 text-sm">Top Colors on Quality Fish</h3>
          <div className="space-y-2">
            {topColors.map(([color, data]) => (
              <div key={color} className="flex items-center gap-3">
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (data.count / topColors[0][1].count) * 100)}%` }}
                  />
                </div>
                <span className="text-slate-300 text-xs w-28 truncate">{color}</span>
                <span className="text-slate-500 text-xs w-6 text-right">{data.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom pour comparison */}
      {(customCount + storeCount) > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-3 text-sm">Custom Pour vs Store Bought (Quality Fish)</h3>
          <div className="flex gap-4">
            <div className="flex-1 bg-slate-900 rounded-lg p-3 text-center">
              <div className="text-emerald-400 text-2xl font-bold">{customCount}</div>
              <div className="text-slate-400 text-xs mt-0.5">Custom Pour</div>
            </div>
            <div className="flex-1 bg-slate-900 rounded-lg p-3 text-center">
              <div className="text-amber-400 text-2xl font-bold">{storeCount}</div>
              <div className="text-slate-400 text-xs mt-0.5">Store Bought</div>
            </div>
          </div>
          {customCount + storeCount >= 5 ? (
            <p className="text-slate-500 text-xs mt-2 text-center">
              Custom pours: {Math.round(customCount / (customCount + storeCount) * 100)}% of quality catches
            </p>
          ) : (
            <p className="text-slate-500 text-xs mt-2 text-center">Log more catches for reliable comparison</p>
          )}
        </div>
      )}
    </div>
  )
}
