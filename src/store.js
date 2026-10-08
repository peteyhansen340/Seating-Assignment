import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { FIXTURE_TYPES, MAX_SEATS, ZONE_COLORS, canPlace, deskIds, findFreeSpot, sampleRoom } from './room'
import { canSit, generate } from './solver'

const uid = () => Math.random().toString(36).slice(2, 10)

/** Drop assignments/locks that point at desks or students that no longer exist. */
function prune(room, students, assignments, locked) {
  const desks = new Set(deskIds(room))
  const ids = new Set(students.map((s) => s.id))
  const next = {}
  for (const [d, s] of Object.entries(assignments)) if (desks.has(d) && ids.has(s)) next[d] = s
  const seated = new Set(Object.values(next))
  return { assignments: next, locked: locked.filter((id) => seated.has(id)) }
}

export const useStore = create(
  persist(
    (set, get) => ({
      room: sampleRoom(),
      students: [],
      assignments: {},
      locked: [],
      selectedDesk: null,
      problems: [],

      addStudents: (names) =>
        set((s) => ({
          students: [
            ...s.students,
            ...names.map((n) => n.trim()).filter(Boolean).map((name) => ({ id: uid(), name, bannedZones: [] })),
          ],
        })),

      removeStudent: (id) =>
        set((s) => {
          const students = s.students.filter((x) => x.id !== id)
          return { students, selectedDesk: null, ...prune(s.room, students, s.assignments, s.locked) }
        }),

      toggleBan: (id, zone) =>
        set((s) => ({
          students: s.students.map((x) =>
            x.id !== id
              ? x
              : {
                  ...x,
                  bannedZones: x.bannedZones.includes(zone)
                    ? x.bannedZones.filter((z) => z !== zone)
                    : [...x.bannedZones, zone],
                },
          ),
        })),

      // ---- room editing ----
      /** Grow or shrink to n seats. Shrinking removes empty seats first, then unlocked, newest first. */
      setSeatCount: (n) => {
        const { room, students, assignments, locked } = get()
        const target = Math.min(MAX_SEATS, Math.max(1, Math.round(n) || 1))
        let next = { ...room, seats: [...room.seats] }
        if (target > next.seats.length) {
          while (next.seats.length < target) {
            const spot = findFreeSpot(next)
            if (!spot) return set({ problems: ['No more floor space. Move seats closer together to fit more.'] })
            next = { ...next, seats: [...next.seats, { id: uid(), ...spot, zones: [] }] }
          }
        } else {
          const taken = new Set(Object.keys(assignments))
          const rank = (seat) => (!taken.has(seat.id) ? 0 : !locked.includes(assignments[seat.id]) ? 1 : 2)
          const order = next.seats.map((seat, i) => ({ seat, i })).sort((a, b) => rank(a.seat) - rank(b.seat) || b.i - a.i)
          const drop = new Set(order.slice(0, next.seats.length - target).map((o) => o.seat.id))
          next = { ...next, seats: next.seats.filter((seat) => !drop.has(seat.id)) }
        }
        set({ room: next, problems: [], selectedDesk: null, ...prune(next, students, assignments, locked) })
      },

      /** kind: 'seat' | 'fixture'. Ignored if the spot is taken or off the floor. */
      moveItem: (kind, id, x, y) =>
        set((s) => {
          const item = (kind === 'seat' ? s.room.seats : s.room.fixtures).find((i) => i.id === id)
          if (!item || !canPlace(s.room, id, x, y, item.w ?? 1, item.h ?? 1)) return {}
          const move = (i) => (i.id === id ? { ...i, x, y } : i)
          return { room: { ...s.room, [kind === 'seat' ? 'seats' : 'fixtures']: (kind === 'seat' ? s.room.seats : s.room.fixtures).map(move) } }
        }),

      /** Add a piece of furniture in the first gap that fits; returns its id (or null if there's no space). */
      addFixture: (kind) => {
        const { room } = get()
        const t = FIXTURE_TYPES[kind]
        const spot = findFreeSpot(room, t.w, t.h)
        if (!spot) {
          set({ problems: [`No free space for a ${t.label.toLowerCase()}. Move things around to make room.`] })
          return null
        }
        const id = uid()
        set({ room: { ...room, fixtures: [...room.fixtures, { id, kind, ...spot, w: t.w, h: t.h }] }, problems: [] })
        return id
      },

      /** Resize or rotate a piece of furniture in place, if it still fits. patch: { w?, h? } */
      resizeFixture: (id, patch) =>
        set((s) => {
          const f = s.room.fixtures.find((x) => x.id === id)
          if (!f) return {}
          const next = { ...f, ...patch }
          if (next.w < 1 || next.h < 1 || !canPlace(s.room, id, f.x, f.y, next.w, next.h)) {
            return { problems: ['There isn’t room for that. Move it or clear some space first.'] }
          }
          return { room: { ...s.room, fixtures: s.room.fixtures.map((x) => (x.id === id ? next : x)) }, problems: [] }
        }),

      removeFixture: (id) => set((s) => ({ room: { ...s.room, fixtures: s.room.fixtures.filter((x) => x.id !== id) } })),

      /** mode: 'add' | 'remove' */
      paintZone: (seatId, zoneId, mode) =>
        set((s) => ({
          room: {
            ...s.room,
            seats: s.room.seats.map((seat) => {
              if (seat.id !== seatId) return seat
              const has = seat.zones.includes(zoneId)
              if (mode === 'add' && !has) return { ...seat, zones: [...seat.zones, zoneId] }
              if (mode === 'remove' && has) return { ...seat, zones: seat.zones.filter((z) => z !== zoneId) }
              return seat
            }),
          },
        })),

      addZone: (name) => {
        const { room } = get()
        const id = uid()
        const color = ZONE_COLORS[room.zones.length % ZONE_COLORS.length]
        set({ room: { ...room, zones: [...room.zones, { id, name: name || 'New zone', color }] } })
        return id
      },

      renameZone: (id, name) =>
        set((s) => ({ room: { ...s.room, zones: s.room.zones.map((z) => (z.id === id ? { ...z, name } : z)) } })),

      deleteZone: (id) =>
        set((s) => {
          return {
            room: { ...s.room, seats: s.room.seats.map((seat) => ({ ...seat, zones: seat.zones.filter((z) => z !== id) })), zones: s.room.zones.filter((z) => z.id !== id) },
            students: s.students.map((x) => ({ ...x, bannedZones: x.bannedZones.filter((z) => z !== id) })),
          }
        }),

      resetRoom: () =>
        set((s) => {
          const room = sampleRoom()
          const students = s.students.map((x) => ({ ...x, bannedZones: [] }))
          return { room, students, selectedDesk: null, ...prune(room, students, s.assignments, s.locked) }
        }),

      // ---- seating ----
      toggleLock: (studentId) =>
        set((s) => ({
          locked: s.locked.includes(studentId) ? s.locked.filter((x) => x !== studentId) : [...s.locked, studentId],
        })),

      // First click selects a desk, second click moves/swaps into the other desk.
      clickDesk: (desk) => {
        const { selectedDesk, assignments, seatStudent } = get()
        if (!selectedDesk) return set({ selectedDesk: desk })
        if (selectedDesk === desk) return set({ selectedDesk: null })
        const a = assignments[selectedDesk]
        const b = assignments[desk]
        if (a) seatStudent(a, desk)
        else if (b) seatStudent(b, selectedDesk)
        set({ selectedDesk: null })
      },

      /** Put a student on a desk (from the roster, the "not seated" tray, or another desk). Swaps with whoever is there. */
      seatStudent: (studentId, desk) => {
        const { assignments, students, room, locked } = get()
        const student = students.find((s) => s.id === studentId)
        if (!student) return
        const from = Object.keys(assignments).find((d) => assignments[d] === studentId)
        if (from === desk) return
        const occupant = assignments[desk]
        if (locked.includes(studentId)) return set({ problems: [`${student.name} is locked. Unlock to move them.`] })
        if (occupant && locked.includes(occupant)) return set({ problems: ['That seat is locked.'] })

        const next = { ...assignments }
        if (from) delete next[from]
        next[desk] = studentId
        if (occupant && from) next[from] = occupant

        const problems = []
        if (!canSit(student, desk, room)) problems.push(`${student.name} is seated in an area they should avoid.`)
        const other = occupant && students.find((s) => s.id === occupant)
        if (other && from && !canSit(other, from, room)) problems.push(`${other.name} is seated in an area they should avoid.`)
        set({ assignments: next, problems, selectedDesk: null })
      },

      generate: () => {
        const { students, room, assignments, locked } = get()
        const res = generate(students, room, assignments, new Set(locked))
        if (res.ok) set({ assignments: res.assignments, problems: [], selectedDesk: null })
        else set({ problems: res.problems })
      },

      clearUnlocked: () =>
        set((s) => {
          const keep = {}
          for (const [d, id] of Object.entries(s.assignments)) if (s.locked.includes(id)) keep[d] = id
          return { assignments: keep, problems: [], selectedDesk: null }
        }),
    }),
    {
      name: 'seating-chart-v3',
      partialize: ({ room, students, assignments, locked }) => ({ room, students, assignments, locked }),
    },
  ),
)
