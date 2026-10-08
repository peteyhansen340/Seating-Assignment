import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { FIXTURE_TYPES, MAX_SEATS, SNAP, canPlace } from './room'
import { violations } from './solver'
import Picker from './Picker'

const FIXTURE_LABEL = { board: 'BOARD', teacher: 'Teacher', door: '🚪', computers: '💻 COMPUTERS', table: 'Table', shelf: '📚 Shelf' }
const snap = (n) => Math.round(n / SNAP) * SNAP

export default function App() {
  const s = useStore()
  const { room } = s
  const [names, setNames] = useState('')
  const [dragging, setDragging] = useState(null) // student being dragged (seating mode)
  const [overDesk, setOverDesk] = useState(null)
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState('move') // 'move' seats around | 'zone' paint
  const [activeZone, setActiveZone] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [presenting, setPresenting] = useState(false)
  const [presentCell, setPresentCell] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedId, setPickedId] = useState(null)
  const [selectedFixture, setSelectedFixture] = useState(null)
  const [drag, setDrag] = useState(null) // item being moved in the editor: { kind, id, x, y, valid }
  const painting = useRef(null)
  const floorRef = useRef(null)

  const closePicker = () => {
    setPickerOpen(false)
    setPickedId(null)
  }

  useEffect(() => {
    const up = () => (painting.current = null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // Present mode: scale the room to fill the screen. Esc closes the picker, then exits present mode.
  useEffect(() => {
    if (!presenting) return
    const fit = () =>
      setPresentCell(Math.max(30, Math.floor(Math.min((innerWidth - 90) / room.w, (innerHeight - 90) / room.h))))
    const key = (e) => {
      if (e.key !== 'Escape') return
      if (pickerOpen) closePicker()
      else setPresenting(false)
    }
    fit()
    addEventListener('resize', fit)
    addEventListener('keydown', key)
    return () => {
      removeEventListener('resize', fit)
      removeEventListener('keydown', key)
    }
  })

  const zoneById = new Map(room.zones.map((z) => [z.id, z]))
  const zoneId = zoneById.has(activeZone) ? activeZone : room.zones[0]?.id
  const seated = new Set(Object.values(s.assignments))
  const unseated = s.students.filter((x) => !seated.has(x.id))
  const byId = new Map(s.students.map((x) => [x.id, x]))
  const bad = violations(s.students, s.assignments, room)
  const fixture = room.fixtures.find((f) => f.id === selectedFixture)

  const add = () => {
    s.addStudents(names.split(/[\n,]/))
    setNames('')
  }

  // ---- editor: drag seats / furniture ----
  const startDrag = (e, kind, item) => {
    if (!editing || tool !== 'move') return
    e.preventDefault()
    setSelectedFixture(kind === 'fixture' ? item.id : null)
    const unit = floorRef.current.clientWidth / room.w
    const w = item.w ?? 1
    const h = item.h ?? 1
    const origin = { px: e.clientX, py: e.clientY, x: item.x, y: item.y }
    let last = null
    const move = (ev) => {
      const x = Math.min(room.w - w, Math.max(0, snap(origin.x + (ev.clientX - origin.px) / unit)))
      const y = Math.min(room.h - h, Math.max(0, snap(origin.y + (ev.clientY - origin.py) / unit)))
      last = { kind, id: item.id, x, y, valid: canPlace(room, item.id, x, y, w, h) }
      setDrag(last)
    }
    const up = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      if (last?.valid) s.moveItem(kind, item.id, last.x, last.y)
      setDrag(null)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }

  // ---- editor: paint zones onto seats ----
  const applyPaint = (seatId) => {
    const p = painting.current
    if (p) s.paintZone(seatId, p.zoneId, p.mode)
  }
  const startPaint = (seat) => {
    if (!editing || tool !== 'zone' || !zoneId) return
    painting.current = { zoneId, mode: seat.zones.includes(zoneId) ? 'remove' : 'add' }
    applyPaint(seat.id)
  }

  const posOf = (kind, item) => (drag && drag.kind === kind && drag.id === item.id ? drag : item)

  return (
    <div className={sidebarOpen && !presenting ? 'app' : 'app no-side'}>
      {sidebarOpen && !presenting && (
        <aside className="sidebar">
          <h1>Seating Chart</h1>
          <section>
            <h2>Students ({s.students.length})</h2>
            <textarea
              placeholder="Add names (one per line or comma-separated)"
              value={names}
              onChange={(e) => setNames(e.target.value)}
              rows={3}
            />
            <button onClick={add} disabled={!names.trim()}>
              Add
            </button>

            <ul className="roster">
              {s.students.map((st) => (
                <li key={st.id}>
                  <div className="roster-head">
                    <span
                      className="chip draggable plain"
                      draggable
                      onDragStart={() => setDragging(st.id)}
                      onDragEnd={() => setDragging(null)}
                      title="Drag onto a desk"
                    >
                      {st.name}
                    </span>
                    <button className="link" onClick={() => s.removeStudent(st.id)} aria-label={`Remove ${st.name}`}>
                      ✕
                    </button>
                  </div>
                  <div className="bans">
                    <span className="hint">Can’t sit:</span>
                    {room.zones.length === 0 && <span className="hint">no zones yet</span>}
                    {room.zones.map((z) => (
                      <label
                        key={z.id}
                        className={st.bannedZones.includes(z.id) ? 'chip on' : 'chip'}
                        style={{ '--zc': z.color }}
                      >
                        <input
                          type="checkbox"
                          checked={st.bannedZones.includes(z.id)}
                          onChange={() => s.toggleBan(st.id, z.id)}
                        />
                        <i className="dot" />
                        {z.name}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      )}

      <main className="main">
        {presenting && (
          <div className="present-bar">
            <button onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}>🎯 Pick a student</button>
            <button onClick={() => setPresenting(false)}>Exit (Esc)</button>
          </div>
        )}

        {!presenting && (
          <div className="toolbar">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>
              {sidebarOpen ? '◀ Hide students' : '☰ Students'}
            </button>
            {!editing && (
              <>
                <button className="primary" onClick={s.generate} disabled={!s.students.length}>
                  🎲 Randomize
                </button>
                <button onClick={s.clearUnlocked}>Clear unlocked</button>
              </>
            )}
            <button
              className={editing ? 'primary' : ''}
              onClick={() => {
                setEditing(!editing)
                setTool('move')
                setSelectedFixture(null)
                painting.current = null
              }}
            >
              {editing ? '✓ Done editing' : '✏️ Edit seats'}
            </button>
            {!editing && (
              <>
                <button onClick={() => setPickerOpen(!pickerOpen)}>🎯 Pick a student</button>
                <button
                  onClick={() => {
                    setPresenting(true)
                    setEditing(false)
                  }}
                >
                  📺 Present
                </button>
              </>
            )}
            <span className="hint">
              {editing
                ? tool === 'move'
                  ? 'Drag seats and furniture anywhere on the floor.'
                  : 'Click or drag across seats to add/remove the selected zone.'
                : 'Drag a name onto any desk to move or swap · or click two desks · 🔒 pins a student'}
            </span>
          </div>
        )}

        {editing && !presenting && (
          <div className="editor">
            <div className="seat-count">
              <strong>Seats</strong>
              <button onClick={() => s.setSeatCount(room.seats.length - 1)} aria-label="Remove a seat">
                −
              </button>
              <input
                type="number"
                min={1}
                max={MAX_SEATS}
                value={room.seats.length}
                onChange={(e) => s.setSeatCount(+e.target.value)}
                aria-label="Number of seats"
              />
              <button onClick={() => s.setSeatCount(room.seats.length + 1)} aria-label="Add a seat">
                ＋
              </button>
              <button onClick={() => s.setSeatCount(s.students.length)} disabled={!s.students.length}>
                Match {s.students.length} students
              </button>
              <button
                onClick={() => {
                  if (confirm('Replace the room with the sample classroom? Zone restrictions on students are cleared.')) s.resetRoom()
                }}
              >
                Reset room
              </button>
            </div>

            <div className="furniture">
              <span className="hint">Furniture — add to the room, then drag it into place:</span>
              <div className="chips">
                {Object.entries(FIXTURE_TYPES).map(([kind, t]) => (
                  <button
                    key={kind}
                    className="tool"
                    onClick={() => {
                      setTool('move')
                      setSelectedFixture(s.addFixture(kind))
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              {fixture && (
                <div className="zone-edit">
                  <strong>{FIXTURE_TYPES[fixture.kind].label}</strong>
                  <button onClick={() => s.resizeFixture(fixture.id, { w: fixture.h, h: fixture.w })}>⟳ Rotate</button>
                  <button
                    onClick={() => s.resizeFixture(fixture.id, fixture.w >= fixture.h ? { w: fixture.w + 1 } : { h: fixture.h + 1 })}
                  >
                    Longer
                  </button>
                  <button
                    onClick={() => s.resizeFixture(fixture.id, fixture.w >= fixture.h ? { w: fixture.w - 1 } : { h: fixture.h - 1 })}
                  >
                    Shorter
                  </button>
                  <button
                    onClick={() => {
                      s.removeFixture(fixture.id)
                      setSelectedFixture(null)
                    }}
                  >
                    🗑 Remove
                  </button>
                </div>
              )}
            </div>

            <div className="zones">
              <span className="hint">
                Zones (areas students can be told to avoid). Pick one, then click seats to add or remove it:
              </span>
              <div className="chips">
                <button className={tool === 'move' ? 'tool on' : 'tool'} onClick={() => setTool('move')}>
                  ↔ Move seats
                </button>
                {room.zones.map((z) => (
                  <button
                    key={z.id}
                    className={tool === 'zone' && zoneId === z.id ? 'tool on' : 'tool'}
                    style={{ '--zc': z.color }}
                    onClick={() => {
                      setActiveZone(z.id)
                      setTool('zone')
                    }}
                  >
                    <i className="dot" /> {z.name}
                  </button>
                ))}
                <button
                  className="tool"
                  onClick={() => {
                    const id = s.addZone('New zone')
                    setActiveZone(id)
                    setTool('zone')
                  }}
                >
                  ＋ New zone
                </button>
              </div>
              {tool === 'zone' && zoneId && (
                <div className="zone-edit">
                  <input
                    value={zoneById.get(zoneId).name}
                    onChange={(e) => s.renameZone(zoneId, e.target.value)}
                    aria-label="Zone name"
                  />
                  <button onClick={() => s.deleteZone(zoneId)}>Delete zone</button>
                </div>
              )}
            </div>
          </div>
        )}

        {s.problems.length > 0 && !presenting && (
          <div className="problems" role="alert">
            {s.problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
        )}

        <div className="room-scroll">
          <div
            className={editing ? 'room editing' : 'room'}
            style={presenting && presentCell ? { '--cell': `${presentCell}px` } : undefined}
          >
            <div
              ref={floorRef}
              className="floor"
              style={{ '--rw': room.w, '--rh': room.h }}
              onPointerDown={(e) => e.target === e.currentTarget && setSelectedFixture(null)}
            >
              {room.fixtures.map((f) => {
                const p = posOf('fixture', f)
                return (
                  <div
                    key={f.id}
                    className={`item fixture ${f.kind}${editing && tool === 'move' ? ' movable' : ''}${p.valid === false ? ' invalid' : ''}${drag?.id === f.id ? ' dragging' : ''}${editing && selectedFixture === f.id ? ' selected-fixture' : ''}${f.h > f.w ? ' vertical' : ''}`}
                    style={{ '--x': p.x, '--y': p.y, '--w': f.w, '--h': f.h }}
                    onPointerDown={(e) => startDrag(e, 'fixture', f)}
                  >
                    {FIXTURE_LABEL[f.kind]}
                  </div>
                )
              })}

              {room.seats.map((seat) => {
                const id = seat.id
                const p = posOf('seat', seat)
                const sid = s.assignments[id]
                const st = sid ? byId.get(sid) : undefined
                const isLocked = !!sid && s.locked.includes(sid)
                const inActive = editing && tool === 'zone' && seat.zones.includes(zoneId)
                const cls = [
                  'item cell desk',
                  isLocked && 'locked',
                  sid && bad.has(sid) && 'violation',
                  s.selectedDesk === id && 'selected',
                  pickedId && sid === pickedId && 'picked',
                  overDesk === id && dragging && 'drop',
                  inActive && 'in-zone',
                  editing && tool === 'move' && 'movable',
                  drag?.id === id && 'dragging',
                  drag?.id === id && !drag.valid && 'invalid',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    key={id}
                    className={cls}
                    style={{ '--x': p.x, '--y': p.y, ...(inActive ? { '--zc': zoneById.get(zoneId).color } : {}) }}
                    onPointerDown={(e) => startDrag(e, 'seat', seat)}
                    onMouseDown={() => startPaint(seat)}
                    onMouseEnter={() => applyPaint(id)}
                    onClick={editing ? undefined : () => s.clickDesk(id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (overDesk !== id) setOverDesk(id)
                    }}
                    onDrop={() => {
                      if (dragging && !editing) s.seatStudent(dragging, id)
                      setDragging(null)
                      setOverDesk(null)
                    }}
                  >
                    <div
                      className={st && !isLocked && !editing ? 'desk-top grab' : 'desk-top'}
                      draggable={!!st && !isLocked && !editing}
                      onDragStart={() => setDragging(st.id)}
                      onDragEnd={() => {
                        setDragging(null)
                        setOverDesk(null)
                      }}
                    >
                      {st && <span className="name">{st.name}</span>}
                      {st && !editing && (
                        <button
                          className="lock"
                          title={isLocked ? 'Unlock' : 'Lock in place'}
                          aria-pressed={isLocked}
                          onClick={(e) => {
                            e.stopPropagation()
                            s.toggleLock(st.id)
                          }}
                        >
                          {isLocked ? '🔒' : '🔓'}
                        </button>
                      )}
                    </div>
                    <div className="zone-dots">
                      {seat.zones.map(
                        (z) =>
                          zoneById.get(z) && (
                            <i key={z} className="dot" style={{ '--zc': zoneById.get(z).color }} title={zoneById.get(z).name} />
                          ),
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {!presenting && (
          <div className="legend">
            {room.zones.map((z) => (
              <span key={z.id} className="chip" style={{ '--zc': z.color }}>
                <i className="dot" /> {z.name}
              </span>
            ))}
          </div>
        )}

        {unseated.length > 0 && !presenting && (
          <div className="unseated">
            <h2>Not seated</h2>
            <div className="chips">
              {unseated.map((st) => (
                <span
                  key={st.id}
                  className="chip draggable"
                  draggable
                  onDragStart={() => setDragging(st.id)}
                  onDragEnd={() => setDragging(null)}
                >
                  {st.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {pickerOpen && <Picker students={s.students} onPick={setPickedId} onClose={closePicker} />}
      </main>
    </div>
  )
}
