import { describe, expect, it } from 'vitest'
import { canSit, generate, violations } from './solver'
import { canPlace, deskIds, findFreeSpot, sampleRoom, zonesOf } from './room'

/** A rows x cols room of seats whose edges are zoned front/back/left/right. */
const grid = (rows, cols) => {
  const seats = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const zones = []
      if (r === 0) zones.push('front')
      if (r === rows - 1) zones.push('back')
      if (c === 0) zones.push('left')
      if (c === cols - 1) zones.push('right')
      seats.push({ id: `${r}-${c}`, x: c, y: r, zones })
    }
  return { w: cols, h: rows, seats, fixtures: [], zones: [] }
}
const layout = grid(4, 4)
const mk = (id, bannedZones = []) => ({ id, name: id, bannedZones })

describe('zones', () => {
  it('only seats students on seats in the room', () => {
    const room = grid(1, 2)
    room.seats = room.seats.slice(0, 1)
    expect(deskIds(room)).toEqual(['0-0'])
    expect(generate([mk('a'), mk('b')], room, {}, new Set()).ok).toBe(false)
  })
  it('detects zones for corner and middle desks', () => {
    expect(zonesOf(layout, '0-0').sort()).toEqual(['front', 'left'])
    expect(zonesOf(layout, '3-3').sort()).toEqual(['back', 'right'])
    expect(zonesOf(layout, '1-1')).toEqual([])
  })
  it('canSit respects bans', () => {
    expect(canSit(mk('a', ['front']), '0-2', layout)).toBe(false)
    expect(canSit(mk('a', ['front']), '1-2', layout)).toBe(true)
  })
})

describe('generate', () => {
  it('seats everyone uniquely without breaking bans', () => {
    const students = Array.from({ length: 16 }, (_, i) => mk(`s${i}`, i < 4 ? ['front', 'back'] : []))
    for (let i = 0; i < 50; i++) {
      const res = generate(students, layout, {}, new Set())
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(new Set(Object.values(res.assignments)).size).toBe(16)
      expect(violations(students, res.assignments, layout).size).toBe(0)
    }
  })

  it('keeps locked students at their desks', () => {
    const students = [mk('a'), mk('b'), mk('c')]
    const current = { '2-2': 'a' }
    for (let i = 0; i < 30; i++) {
      const res = generate(students, layout, current, new Set(['a']))
      expect(res.ok && res.assignments['2-2']).toBe('a')
    }
  })

  it('does not place anyone on a locked desk', () => {
    const students = [mk('a'), mk('b')]
    const res = generate(students, grid(1, 2), { '0-0': 'a' }, new Set(['a']))
    expect(res.ok && res.assignments).toEqual({ '0-0': 'a', '0-1': 'b' })
  })

  it('reports too few desks', () => {
    const res = generate([mk('a'), mk('b'), mk('c')], grid(1, 2), {}, new Set())
    expect(res.ok).toBe(false)
  })

  it('reports a student with no allowed desks', () => {
    const res = generate([mk('a', ['front', 'back'])], grid(2, 3), {}, new Set())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.problems[0]).toMatch(/a has no allowed desks/)
  })

  it('finds a solution when constraints are tight', () => {
    const bad = generate([mk('a', ['front']), mk('b', ['front']), mk('c', ['front'])], grid(2, 2), {}, new Set())
    expect(bad.ok).toBe(false)
    const ok = generate(
      [mk('a', ['front']), mk('b', ['front']), mk('c', ['back']), mk('d', ['back'])],
      grid(2, 2),
      {},
      new Set(),
    )
    expect(ok.ok).toBe(true)
    expect(deskIds(grid(2, 2)).length).toBe(4)
  })
})

describe('placement', () => {
  const room = sampleRoom()
  it('rejects overlaps and out-of-bounds, allows free spots', () => {
    const seat = room.seats[0]
    expect(canPlace(room, seat.id, seat.x, seat.y, 1, 1)).toBe(true) // itself
    expect(canPlace(room, seat.id, 3, 0, 1, 1)).toBe(false) // on the board
    expect(canPlace(room, seat.id, -1, 4, 1, 1)).toBe(false)
    expect(canPlace(room, seat.id, 11.5, 4, 1, 1)).toBe(false)
    expect(canPlace(room, seat.id, 4, 1, 1, 1)).toBe(true)
  })
  it('finds a free spot for a new seat', () => {
    const spot = findFreeSpot(room)
    expect(canPlace(room, '', spot.x, spot.y, 1, 1)).toBe(true)
  })
  it('finds a gap for bigger furniture, or null when nothing fits', () => {
    const spot = findFreeSpot(room, 3, 1)
    expect(canPlace(room, '', spot.x, spot.y, 3, 1)).toBe(true)
    expect(findFreeSpot(room, 13, 1)).toBeNull()
  })
})
