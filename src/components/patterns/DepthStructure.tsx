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

  const columnData = WATER_COLUMNS.map(col => {
    const at = lmb.filter(f => f.waterColumn === col)
    const avgW = at.length > 0
      ? +(at.reduce((s, f) => s + f.weightLbs + f.weightOz / 16, 0) / at.length).toFixed(2)
      : 0
    return {
      col: col.replace('Subsurface top 2 ft', 'Sub-surface').replace('Near bottom', 'Near btm'),
      avg: avgW,
      count: at.length,
    }
  }).filter(d => d.count > 0)

  const structureData = STRUCTURE_TYPES.map(str => {
    const qualityAt = quality.filter(f => f.structure === str)
    return { structure: str, count: qualityAt.length }
  }).filter(d => d.count > 0).sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-5 pb-6">
      {columnData.length > 0 ? (
        <div className="th-surface rounded-xl border th-border p-4">
          <h3 className="th-text font-semibold mb-1 text-sm">Avg Weight by Water Column</h3>
          <p className="th-text-muted text-xs mb-3">Surface vs bottom vs mid-column</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={columnData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--th-border)" horizontal={false} />
              <XAxis type="number" unit=" lbs" tick={{ fontSize: 10, fill: 'var(--th-text-muted)' }} />
              <YAxis dataKey="col" type="category" tick={{ fontSize: 9, fill: 'var(--th-text-muted)' }} width={80} />
              <Tooltip
                contentStyle={{ background: 'var(--th-surface)', border: '1px solid var(--th-border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--th-text-muted)' }}
                itemStyle={{ color: 'var(--th-text)' }}
              />
              <Bar dataKey="avg" fill="var(--th-accent)" radius={[0, 4, 4, 0]} name="Avg weight" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {columnData.map(d => (
              <div key={d.col} className="flex justify-between text-xs">
                <span className="th-text-muted">{d.col}</span>
                <span className="th-text-muted opacity-70">{d.count} catches · {d.avg} lbs avg</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="th-text-muted text-sm text-center py-4">Log catches with water column data to see analysis.</p>
      )}

      {structureData.length > 0 ? (
        <div className="th-surface rounded-xl border th-border p-4">
          <h3 className="th-text font-semibold mb-3 text-sm">Best Structure for Quality Fish (≥{threshold} lb)</h3>
          <div className="space-y-2">
            {structureData.map(d => (
              <div key={d.structure} className="flex items-center gap-3">
                <div className="flex-1 th-surface-deep rounded-full h-2 overflow-hidden border th-border">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (d.count / structureData[0].count) * 100)}%`,
                      background: 'var(--th-accent)',
                    }}
                  />
                </div>
                <span className="th-text text-sm w-28 truncate">{d.structure}</span>
                <span className="th-text-muted text-xs w-4 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="th-surface rounded-xl border th-border p-4 text-center">
          <p className="th-text-muted text-sm">Log structure data on quality fish to see analysis.</p>
        </div>
      )}
    </div>
  )
}
