import { useEffect, useRef, useState } from 'react'

/** Random name picker. Calls onPick(studentId) when a name lands so the chart can highlight that desk. */
export default function Picker({ students, onPick, onClose }) {
  const [shown, setShown] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [done, setDone] = useState([]) // ids already picked
  const [noRepeat, setNoRepeat] = useState(true)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const doneInRoster = done.filter((id) => students.some((s) => s.id === id))
  const pool = noRepeat ? students.filter((s) => !doneInRoster.includes(s.id)) : students
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

  const pick = () => {
    if (spinning || pool.length === 0) return
    const winner = rand(pool)
    setSpinning(true)
    onPick(null)
    let ticks = 0
    timer.current = setInterval(() => {
      ticks++
      if (ticks > 14) {
        clearInterval(timer.current)
        setShown(winner)
        setSpinning(false)
        setDone((d) => [...d, winner.id])
        onPick(winner.id)
      } else {
        setShown(rand(students))
      }
    }, 70)
  }

  const reset = () => {
    setDone([])
    setShown(null)
    onPick(null)
  }

  const exhausted = noRepeat && students.length > 0 && pool.length === 0

  return (
    <div className="picker" role="dialog" aria-label="Random name picker">
      <button className="link close" onClick={onClose} aria-label="Close picker">
        ✕
      </button>
      <div className={spinning ? 'picked-name spinning' : 'picked-name'}>
        {students.length === 0 ? 'Add students first' : exhausted ? 'Everyone has gone!' : (shown?.name ?? '?')}
      </div>
      <div className="picker-actions">
        <button className="primary" onClick={pick} disabled={spinning || pool.length === 0}>
          🎯 {shown ? 'Pick another' : 'Pick a student'}
        </button>
        <button onClick={reset} disabled={spinning || (!done.length && !shown)}>
          Reset
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} />
        Don’t repeat until everyone has gone
      </label>
      {noRepeat && students.length > 0 && (
        <div className="hint">
          {pool.length} of {students.length} left
        </div>
      )}
    </div>
  )
}
