import { useStore, work } from './store'

const ask = (label, current, then) => {
  const name = prompt(label, current)
  if (name && name.trim()) then(name.trim())
}

/** Pick the class (period) and the chart within it; add, rename, copy, delete. */
export default function ClassBar() {
  const s = useStore()
  const { cls, chart } = work(s)

  return (
    <div className="classbar">
      <div className="picker-group">
        <label className="inline">
          Class
          <select value={cls.id} onChange={(e) => s.setActiveClass(e.target.value)}>
            {s.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button title="New class" aria-label="New class" onClick={() => ask('Class name', `Period ${s.classes.length + 1}`, s.addClass)}>
          ＋
        </button>
        <button title="Rename class" aria-label="Rename class" onClick={() => ask('Class name', cls.name, (n) => s.renameClass(cls.id, n))}>
          ✎
        </button>
        <button title="Duplicate class" aria-label="Duplicate class" onClick={() => s.duplicateClass(cls.id)}>
          ⧉
        </button>
        <button
          title="Delete class"
          aria-label="Delete class"
          disabled={s.classes.length <= 1}
          onClick={() => confirm(`Delete “${cls.name}” and its students and charts?`) && s.deleteClass(cls.id)}
        >
          🗑
        </button>
      </div>

      <div className="picker-group">
        <label className="inline">
          Chart
          <select value={chart.id} onChange={(e) => s.setActiveChart(e.target.value)}>
            {cls.charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          title="New chart (copy of this one)"
          aria-label="New chart"
          onClick={() => ask('Chart name', `Chart ${cls.charts.length + 1}`, (n) => s.addChart(n, true))}
        >
          ＋
        </button>
        <button title="Rename chart" aria-label="Rename chart" onClick={() => ask('Chart name', chart.name, (n) => s.renameChart(chart.id, n))}>
          ✎
        </button>
        <button
          title="Delete chart"
          aria-label="Delete chart"
          disabled={cls.charts.length <= 1}
          onClick={() => confirm(`Delete chart “${chart.name}”?`) && s.deleteChart(chart.id)}
        >
          🗑
        </button>
      </div>
    </div>
  )
}
