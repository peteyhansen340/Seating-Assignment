import { sampleRoom } from './room'

/**
 * The teacher's whole library:
 *   rooms:   { [roomId]: { id, name, w, h, seats, fixtures, zones } }   (shared by every class held in that room)
 *   classes: [{ id, name, roomId, students: [{ id, name, bannedZones }], charts: [chart], activeChartId }]
 *   chart:   { id, name, assignments: { seatId: studentId }, locked: [studentId] }
 * Everything here is pure so it can be tested and reused by local storage and the cloud sync.
 */

export const newId = () => crypto.randomUUID()
export const newChart = (name, base = {}) => ({ id: newId(), name, assignments: {}, locked: [], ...base })

export function emptyClass(roomId, name = 'Period 1') {
  const chart = newChart('Chart 1')
  return { id: newId(), name, roomId, students: [], charts: [chart], activeChartId: chart.id }
}

export function defaultLibrary() {
  const room = { id: newId(), name: 'My classroom', ...sampleRoom() }
  const cls = emptyClass(room.id)
  return { rooms: { [room.id]: room }, classes: [cls], activeClassId: cls.id }
}

/** True when there's nothing worth keeping (no students anywhere). */
export const isBlank = (lib) => lib.classes.every((c) => c.students.length === 0)

/** Drop seat/student references that no longer exist (after seats or students are removed). */
export function pruneClass(cls, room) {
  const seats = new Set(room.seats.map((s) => s.id))
  const ids = new Set(cls.students.map((s) => s.id))
  return {
    ...cls,
    charts: cls.charts.map((ch) => {
      const assignments = {}
      for (const [seat, sid] of Object.entries(ch.assignments)) if (seats.has(seat) && ids.has(sid)) assignments[seat] = sid
      const seated = new Set(Object.values(assignments))
      return { ...ch, assignments, locked: ch.locked.filter((id) => seated.has(id)) }
    }),
  }
}

/** Deep copy of a class with fresh ids (students, charts, and the chart references to them). */
export function cloneClass(cls, name = cls.name, roomId = cls.roomId) {
  const ids = new Map(cls.students.map((s) => [s.id, newId()]))
  const charts = cls.charts.map((ch) => ({
    old: ch.id,
    chart: {
      id: newId(),
      name: ch.name,
      assignments: Object.fromEntries(
        Object.entries(ch.assignments).filter(([, sid]) => ids.has(sid)).map(([seat, sid]) => [seat, ids.get(sid)]),
      ),
      locked: ch.locked.filter((id) => ids.has(id)).map((id) => ids.get(id)),
    },
  }))
  const active = charts.find((c) => c.old === cls.activeChartId) ?? charts[0]
  return {
    id: newId(),
    name,
    roomId,
    students: cls.students.map((s) => ({ ...s, id: ids.get(s.id) })),
    charts: charts.map((c) => c.chart),
    activeChartId: active.chart.id,
  }
}

const roomKey = (r) => JSON.stringify({ w: r.w, h: r.h, seats: r.seats, fixtures: r.fixtures, zones: r.zones })

/** Add `extra`'s classes to `base`. Rooms that are identical to one already in `base` are reused. */
export function mergeLibraries(base, extra) {
  const rooms = { ...base.rooms }
  const byKey = new Map(Object.values(base.rooms).map((r) => [roomKey(r), r.id]))
  const idMap = new Map()
  for (const r of Object.values(extra.rooms)) {
    const existing = byKey.get(roomKey(r))
    if (existing) idMap.set(r.id, existing)
    else {
      const id = newId()
      idMap.set(r.id, id)
      rooms[id] = { ...r, id }
    }
  }
  const classes = [...base.classes, ...extra.classes.map((c) => cloneClass(c, c.name, idMap.get(c.roomId)))]
  return { ...base, rooms, classes }
}

/** One-time import of data saved by the earlier single-class version of the app. */
export function legacyImport() {
  try {
    const raw = localStorage.getItem('seating-chart-v3')
    if (!raw) return null
    const { state } = JSON.parse(raw)
    if (!state?.room?.seats) return null
    const room = { id: newId(), name: 'My classroom', ...state.room }
    const ids = new Map((state.students ?? []).map((s) => [s.id, newId()]))
    const students = (state.students ?? []).map((s) => ({ ...s, id: ids.get(s.id) }))
    const chart = newChart('Chart 1', {
      assignments: Object.fromEntries(
        Object.entries(state.assignments ?? {}).filter(([, sid]) => ids.has(sid)).map(([seat, sid]) => [seat, ids.get(sid)]),
      ),
      locked: (state.locked ?? []).filter((id) => ids.has(id)).map((id) => ids.get(id)),
    })
    const cls = { id: newId(), name: 'Period 1', roomId: room.id, students, charts: [chart], activeChartId: chart.id }
    return { rooms: { [room.id]: room }, classes: [cls], activeClassId: cls.id }
  } catch {
    return null
  }
}

// ---- database rows (see supabase/schema.sql) ----

export const TABLES = ['rooms', 'classes', 'students', 'charts']

export function toRows(lib, teacherId) {
  const classes = lib.classes
  return {
    rooms: Object.values(lib.rooms).map((r) => ({
      id: r.id,
      teacher_id: teacherId,
      name: r.name,
      data: { w: r.w, h: r.h, seats: r.seats, fixtures: r.fixtures, zones: r.zones },
    })),
    classes: classes.map((c, i) => ({
      id: c.id,
      teacher_id: teacherId,
      room_id: c.roomId,
      name: c.name,
      position: i,
      active_chart_id: c.activeChartId,
    })),
    students: classes.flatMap((c) =>
      c.students.map((s, i) => ({
        id: s.id,
        class_id: c.id,
        teacher_id: teacherId,
        name: s.name,
        banned_zones: s.bannedZones,
        position: i,
      })),
    ),
    charts: classes.flatMap((c) =>
      c.charts.map((ch, i) => ({
        id: ch.id,
        class_id: c.id,
        teacher_id: teacherId,
        name: ch.name,
        assignments: ch.assignments,
        locked: ch.locked,
        position: i,
      })),
    ),
  }
}

export function fromRows({ rooms = [], classes = [], students = [], charts = [] }) {
  const byPosition = (a, b) => a.position - b.position
  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, { id: r.id, name: r.name, ...r.data }]))
  const list = [...classes].sort(byPosition).map((c) => {
    const chs = charts
      .filter((x) => x.class_id === c.id)
      .sort(byPosition)
      .map((x) => ({ id: x.id, name: x.name, assignments: x.assignments ?? {}, locked: x.locked ?? [] }))
    const sts = students
      .filter((x) => x.class_id === c.id)
      .sort(byPosition)
      .map((x) => ({ id: x.id, name: x.name, bannedZones: x.banned_zones ?? [] }))
    const charts2 = chs.length ? chs : [newChart('Chart 1')]
    return {
      id: c.id,
      name: c.name,
      roomId: c.room_id,
      students: sts,
      charts: charts2,
      activeChartId: charts2.some((x) => x.id === c.active_chart_id) ? c.active_chart_id : charts2[0].id,
    }
  })
  return { rooms: roomMap, classes: list, activeClassId: list[0]?.id ?? null }
}

/** What changed between two row sets: rows to upsert and ids to delete, per table. */
export function diffRows(prev, next) {
  const upserts = {}
  const deletes = {}
  for (const t of TABLES) {
    const before = new Map((prev?.[t] ?? []).map((r) => [r.id, JSON.stringify(r)]))
    upserts[t] = next[t].filter((r) => before.get(r.id) !== JSON.stringify(r))
    const keep = new Set(next[t].map((r) => r.id))
    deletes[t] = [...before.keys()].filter((id) => !keep.has(id))
  }
  return { upserts, deletes }
}

export const isEmptyDiff = ({ upserts, deletes }) =>
  TABLES.every((t) => upserts[t].length === 0 && deletes[t].length === 0)
