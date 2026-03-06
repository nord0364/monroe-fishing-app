
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { LandedFish, AppSettings } from '../../types'
import { WATER_COLUMNS, STRUCTURE_TYPES } from '../../constants'

interface Props {
  fish: LandedFish[]
  settings: AppSettings
}

export default function DepthStructure({ fish, settings }: Props) {
  const threshold = settings.sizeThresholdLbs ?? 3
  const lmb = fish.filter(f => f.species === 'Largemouth Bass')
  const quality = lmb.filter(f => f.weightLbs + f.weightOz / 16 >= threshold)

  // Size by column fished
  const columnData = WATER_COLUMNS.map(col => {
    const at = lmb.filter(f => f.waterColumn === col)
    const avgW = at.length > 0
      ? +(at.reduce((s, f) => s + f.weightLbs + f.weightOz / 16, 0) / at.length).toFixed(2)
      : 0
    return { col: col.replace('Subsurface top 2 ft', 'Sub-surface').replace('Near bottom', 'Near btm'), avg: avgW, count: at.length }
  }).filter(d => d.count > 0)

  // Most productive structure for quality fish
  const structureData = STRUCTURE_TYPES.map(str => {
    const qualityAt = quality.filter(f => f.structure === str)
    return { structure: str, count: qualityAt.length }
  }).filter(d => d.count > 0).sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-5 pb-6">
      {/* Size by column */}
      {columnData.length > 0 ? (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-1 text-sm">Avg Weight by Water Column</h3>
          <p className="text-slate-500 text-xs mb-3">Surface vs bottom vs mid-column</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={columnData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" unit=" lbs" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis dataKey="col" type="category" tick={{ fontSize: 9, fill: '#94a3b8' }} width={80} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
              <Bar dataKey="avg" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Avg weight" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {columnData.map(d => (
              <div key={d.col} className="flex justify-between text-xs">
                <span className="text-slate-400">{d.col}</span>
                <span className="text-slate-500">{d.count} catches · {d.avg} lbs avg</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-slate-500 text-sm text-center py-4">Log catches with water column data to see analysis.</p>
      )}

      {/* Most productive structure for quality fish */}
      {structureData.length > 0 ? (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-3 text-sm">Best Structure for Quality Fish (≥{threshold}lb)</h3>
          <div className="space-y-2">
            {structureData.map(d => (
              <div key={d.structure} className="flex items-center gap-3">
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${Math.min(100, (d.count / structureData[0].count) * 100)}%` }}
                  />
                </div>
                <span className="text-slate-300 text-sm w-28 truncate">{d.structure}</span>
                <span className="text-slate-500 text-xs w-4 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-center">
          <p className="text-slate-500 text-sm">Log structure data on quality fish to see analysis</p>
        </div>
      )}
    </div>
  )
}
