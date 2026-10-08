import { deskIds, zonesOf } from './room'

/** @typedef {{ id: string, name: string, bannedZones: string[] }} Student */
/** @typedef {Record<string, string>} Assignments  deskId -> studentId */

export function canSit(student, desk, room) {
  const zones = zonesOf(room, desk)
  return !student.bannedZones.some((z) => zones.includes(z))
}

/** Students currently sitting somewhere they shouldn't. */
export function violations(students, assignments, room) {
  const byId = new Map(students.map((s) => [s.id, s]))
  const bad = new Set()
  for (const [desk, sid] of Object.entries(assignments)) {
    const s = byId.get(sid)
    if (s && !canSit(s, desk, room)) bad.add(sid)
  }
  return bad
}

const MAX_STEPS = 200_000

function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Randomly seat every student that isn't locked. Locked students keep their
 * current desk. Hard constraints (banned zones) are never broken: if no valid
 * arrangement exists, returns the reasons instead.
 *
 * @returns {{ ok: true, assignments: Assignments } | { ok: false, problems: string[] }}
 */
export function generate(students, room, current, locked, rng = Math.random) {
  const deskOf = new Map()
  for (const [d, s] of Object.entries(current)) deskOf.set(s, d)

  const fixed = {}
  const todo = []
  for (const s of students) {
    const d = deskOf.get(s.id)
    if (locked.has(s.id) && d) fixed[d] = s.id
    else todo.push(s)
  }

  const freeDesks = deskIds(room).filter((d) => !(d in fixed))
  const problems = []

  if (todo.length > freeDesks.length) {
    problems.push(
      `${todo.length} students need seats but only ${freeDesks.length} desks are free. Add desks or unlock some students.`,
    )
    return { ok: false, problems }
  }

  const candidates = new Map()
  for (const s of todo) {
    const c = freeDesks.filter((d) => canSit(s, d, room))
    candidates.set(s.id, c)
    if (c.length === 0) problems.push(`${s.name} has no allowed desks left.`)
  }
  if (problems.length) return { ok: false, problems }

  const result = { ...fixed }
  const taken = new Set()
  const placed = new Set()
  let steps = 0

  const solve = () => {
    if (placed.size === todo.length) return true
    if (++steps > MAX_STEPS) return false

    // Most-constrained student first.
    let pick = null
    let pickOptions = []
    for (const s of todo) {
      if (placed.has(s.id)) continue
      const options = candidates.get(s.id).filter((d) => !taken.has(d))
      if (!pick || options.length < pickOptions.length) {
        pick = s
        pickOptions = options
        if (options.length === 0) return false
      }
    }
    if (!pick) return true

    placed.add(pick.id)
    for (const d of shuffle(pickOptions, rng)) {
      taken.add(d)
      result[d] = pick.id
      if (solve()) return true
      delete result[d]
      taken.delete(d)
    }
    placed.delete(pick.id)
    return false
  }

  if (solve()) return { ok: true, assignments: result }
  return {
    ok: false,
    problems: [
      'No seating arrangement satisfies everyone’s restrictions with the current locks. Try unlocking a student or relaxing a restriction.',
    ],
  }
}
