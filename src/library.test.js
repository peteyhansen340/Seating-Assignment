import { describe, expect, it } from 'vitest'
import { cloneClass, defaultLibrary, diffRows, fromRows, isBlank, isEmptyDiff, mergeLibraries, newId, pruneClass, toRows } from './library'

const withStudents = () => {
  const lib = defaultLibrary()
  const cls = lib.classes[0]
  const a = { id: newId(), name: 'Ava', bannedZones: ['front'] }
  const b = { id: newId(), name: 'Ben', bannedZones: [] }
  const seat = lib.rooms[cls.roomId].seats
  cls.students = [a, b]
  cls.charts[0].assignments = { [seat[0].id]: a.id, [seat[1].id]: b.id }
  cls.charts[0].locked = [a.id]
  return { lib, cls, a, b, seat }
}

describe('library', () => {
  it('starts blank and detects data', () => {
    expect(isBlank(defaultLibrary())).toBe(true)
    expect(isBlank(withStudents().lib)).toBe(false)
  })

  it('round-trips through database rows', () => {
    const { lib } = withStudents()
    const back = fromRows(toRows(lib, 'teacher-1'))
    expect(back.classes).toEqual(lib.classes)
    expect(back.rooms).toEqual(lib.rooms)
    expect(back.activeClassId).toBe(lib.activeClassId)
  })

  it('prunes assignments for removed seats and students', () => {
    const { lib, cls, a, seat } = withStudents()
    const room = { ...lib.rooms[cls.roomId], seats: seat.slice(1) } // first seat (Ava's) removed
    const pruned = pruneClass(cls, room)
    expect(Object.values(pruned.charts[0].assignments)).not.toContain(a.id)
    expect(pruned.charts[0].locked).toEqual([])
    const noBen = pruneClass({ ...cls, students: cls.students.filter((s) => s.name !== 'Ben') }, lib.rooms[cls.roomId])
    expect(Object.values(noBen.charts[0].assignments)).toEqual([a.id])
  })

  it('clones a class with fresh ids but the same seating', () => {
    const { cls } = withStudents()
    const copy = cloneClass(cls, 'Copy')
    expect(copy.id).not.toBe(cls.id)
    expect(copy.students.map((s) => s.name)).toEqual(['Ava', 'Ben'])
    expect(copy.students[0].id).not.toBe(cls.students[0].id)
    const names = Object.values(copy.charts[0].assignments).map((id) => copy.students.find((s) => s.id === id).name)
    expect(names.sort()).toEqual(['Ava', 'Ben'])
    expect(copy.charts[0].locked).toEqual([copy.students[0].id])
    expect(copy.charts.some((c) => c.id === copy.activeChartId)).toBe(true)
  })

  it('merges classes and reuses an identical room', () => {
    const base = defaultLibrary()
    const extra = withStudents().lib
    // make the two libraries' rooms identical content
    extra.rooms[extra.classes[0].roomId] = { ...base.rooms[base.classes[0].roomId], id: extra.classes[0].roomId }
    const merged = mergeLibraries(base, extra)
    expect(merged.classes).toHaveLength(2)
    expect(Object.keys(merged.rooms)).toHaveLength(1)
    expect(merged.classes[1].roomId).toBe(base.classes[0].roomId)
  })

  it('diffs rows into upserts and deletes', () => {
    const { lib, cls } = withStudents()
    const prev = toRows(lib, 't')
    expect(isEmptyDiff(diffRows(prev, toRows(lib, 't')))).toBe(true)

    cls.students = cls.students.slice(1) // remove Ava
    cls.charts[0].assignments = {}
    const d = diffRows(prev, toRows(lib, 't'))
    expect(d.deletes.students).toHaveLength(1)
    expect(d.upserts.charts).toHaveLength(1)
    expect(d.upserts.classes).toHaveLength(0)
    expect(diffRows(null, prev).upserts.rooms).toHaveLength(1)
  })
})
