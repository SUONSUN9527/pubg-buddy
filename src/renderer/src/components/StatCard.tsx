interface Props {
  label: string
  value: string
  unit?: string
  /** 核心指标:角标与数值用空投橙 */
  hot?: boolean
  big?: boolean
}

export default function StatCard({ label, value, unit, hot, big }: Props) {
  return (
    <div className={`hud-card ${hot ? 'hud-card--hot' : ''} px-4 ${big ? 'py-4' : 'py-3'}`}>
      <div className="eyebrow">{label}</div>
      <div
        className={`hud-num mt-1.5 leading-none ${big ? 'text-2xl' : 'text-lg'} ${hot ? 'text-drop' : 'text-ink'}`}
      >
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-mut">{unit}</span>}
      </div>
    </div>
  )
}
