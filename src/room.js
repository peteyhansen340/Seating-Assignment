/**
 * A room is a floor of `w` x `h` units (one seat = 1 unit). Seats and fixtures sit at free x/y positions.
 *   seats:    { id, x, y, zones: string[] }
 *   fixtures: { id, kind: 'board'|'teacher'|'computers'|'door', x, y, w, h }
 *   zones:    { id, name, color }  teacher-defined named areas ("Near door", "By window", ...)
 */

export const ZONE_COLORS = ['#e4572e', '#2e86ab', '#4caf50', '#f2a900', '#8e5ea2', '#00a6a6', '#d6336c', '#7a8b99']
export const SNAP = 0.5

/** Furniture the teacher can add. w x h is the default size in seat units (long side first). */
export const FIXTURE_TYPES = {
  board: { label: 'Board', icon: '🟩', w: 6, h: 1 },
  teacher: { label: 'Teacher desk', icon: '🧑‍🏫', w: 2, h: 1 },
  computers: { label: 'Computers', icon: '💻', w: 1, h: 4 },
  door: { label: 'Door', icon: '🚪', w: 1, h: 1 },
  table: { label: 'Table', icon: '🟫', w: 2, h: 1 },
  shelf: { label: 'Shelf', icon: '📚', w: 3, h: 1 },
}
export const MAX_SEATS = 60

export const deskIds = (room) => room.seats.map((s) => s.id)
export const zonesOf = (room, id) => room.seats.find((s) => s.id === id)?.zones ?? []

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6

const rectsOf = (room) => [
  ...room.seats.map((s) => ({ id: s.id, x: s.x, y: s.y, w: 1, h: 1 })),
  ...room.fixtures,
]

/** Can an item of size w x h sit at x,y (inside the floor, not overlapping anything else)? */
export function canPlace(room, id, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > room.w + 1e-6 || y + h > room.h + 1e-6) return false
  const me = { x, y, w, h }
  return !rectsOf(room).some((r) => r.id !== id && overlaps(me, r))
}

/**
 * First open spot for a w x h item. Seats (1x1) fill row by row and leave the front row for last so the
 * board area stays clear; bigger furniture just takes the first gap that fits.
 */
export function findFreeSpot(room, w = 1, h = 1) {
  if (w === 1 && h === 1) {
    for (let y = 1; y < room.h; y++)
      for (let x = 0; x < room.w; x++) if (canPlace(room, '', x, y, 1, 1)) return { x, y }
    for (let x = 0; x < room.w; x++) if (canPlace(room, '', x, 0, 1, 1)) return { x, y: 0 }
    return null
  }
  for (let y = 0; y + h <= room.h; y++)
    for (let x = 0; x + w <= room.w; x++) if (canPlace(room, '', x, y, w, h)) return { x, y }
  return null
}

/** A room modeled on a hand-drawn classroom: board + teacher up front, computer bench on the right, door in the corner. */
export function sampleRoom() {
  const seats = []
  for (let r = 2; r <= 7; r++) {
    for (const c of [1, 2, 3, 5, 6, 8, 9]) {
      const zones = []
      if (r <= 3) zones.push('front')
      if (r >= 6) zones.push('back')
      if (r <= 3 && c <= 3) zones.push('teacher')
      if (c === 9) zones.push('computers')
      if (r >= 6 && c >= 8) zones.push('door')
      seats.push({ id: `seat-${r}-${c}`, x: c, y: r, zones })
    }
  }
  return {
    w: 12,
    h: 9,
    seats,
    fixtures: [
      { id: 'board', kind: 'board', x: 3, y: 0, w: 6, h: 1 },
      { id: 'teacher', kind: 'teacher', x: 0, y: 0, w: 2, h: 1 },
      { id: 'computers', kind: 'computers', x: 11, y: 2, w: 1, h: 6 },
      { id: 'door', kind: 'door', x: 11, y: 8, w: 1, h: 1 },
    ],
    zones: [
      { id: 'front', name: 'Front', color: ZONE_COLORS[1] },
      { id: 'back', name: 'Back', color: ZONE_COLORS[0] },
      { id: 'teacher', name: 'Near teacher', color: ZONE_COLORS[2] },
      { id: 'computers', name: 'Near computers', color: ZONE_COLORS[3] },
      { id: 'door', name: 'Near door', color: ZONE_COLORS[4] },
    ],
  }
}
