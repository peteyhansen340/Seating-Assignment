import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { FIXTURE_TYPES, MAX_SEATS, ZONE_COLORS, canPlace, findFreeSpot, sampleRoom } from './room'
import { canSit, generate } from './solver'
import { cloneClass, defaultLibrary, emptyClass, legacyImport, newChart, newId, pruneClass } from './library'

/** The active class, its active chart, and the room it meets in. Everything the seating UI edits lives here. */
export function work(s) {
  const cls = s.classes.find((c) => c.id === s.activeClassId) ?? s.classes[0]
  const chart = cls.charts.find((c) => c.id === cls.activeChartId) ?? cls.charts[0]
  return { cls, chart, room: s.rooms[cls.roomId], students: cls.students, assignments: chart.assignments, locked: chart.locked }
}

const initial = legacyImport() ?? defaultLibrary()

export const useStore = create(
  persist(
    (set, get) => {
      /**
       * Apply a change to the active class/chart/room. patch: { students?, assignments?, locked?, room? } plus any
       * top-level UI state (problems, selectedDesk). Changing the room or students prunes stale seat references in
       * every class that meets in that room.
       */
      const put = (patch) =>
        set((s) => {
          const { cls, chart, room } = work(s)
          const { students, assignments, locked, room: newRoom, ...ui } = patch
          const rooms = newRoom ? { ...s.rooms, [room.id]: newRoom } : s.rooms
          const classes = s.classes.map((c) => {
            let next = c
            if (c.id === cls.id) {
              if (students) next = { ...next, students }
              if (assignments || locked) {
                next = {
                  ...next,
                  charts: next.charts.map((ch) =>
                    ch.id === chart.id ? { ...ch, ...(assignments && { assignments }), ...(locked && { locked }) } : ch,
                  ),
                }
              }
            }
            return (newRoom && c.roomId === room.id) || (students && c.id === cls.id) ? pruneClass(next, rooms[next.roomId]) : next
          })
          return { rooms, classes, ...ui }
        })

      const mapClass = (id, fn) => set((s) => ({ classes: s.classes.map((c) => (c.id === id ? fn(c) : c)) }))

      return {
        ...initial,
        selectedDesk: null,
        problems: [],

        // ---- classes & charts ----
        setActiveClass: (id) => set({ activeClassId: id, selectedDesk: null, problems: [] }),

        addClass: (name) => {
          const { cls, room } = work(get())
          const next = emptyClass(room.id, name || `Period ${get().classes.length + 1}`)
          // New classes meet in the same room as the one you're looking at.
          set((s) => ({ classes: [...s.classes, { ...next, roomId: cls.roomId }], activeClassId: next.id, selectedDesk: null, problems: [] }))
        },

        renameClass: (id, name) => mapClass(id, (c) => ({ ...c, name })),

        duplicateClass: (id) => {
          const src = get().classes.find((c) => c.id === id)
          if (!src) return
          const copy = cloneClass(src, `${src.name} (copy)`)
          set((s) => {
            const at = s.classes.findIndex((c) => c.id === id) + 1
            return { classes: [...s.classes.slice(0, at), copy, ...s.classes.slice(at)], activeClassId: copy.id, selectedDesk: null }
          })
        },

        deleteClass: (id) =>
          set((s) => {
            if (s.classes.length <= 1) return { problems: ['Keep at least one class.'] }
            const classes = s.classes.filter((c) => c.id !== id)
            const used = new Set(classes.map((c) => c.roomId))
            const rooms = Object.fromEntries(Object.entries(s.rooms).filter(([rid]) => used.has(rid)))
            return { classes, rooms, activeClassId: s.activeClassId === id ? classes[0].id : s.activeClassId, selectedDesk: null }
          }),

        setActiveChart: (id) => {
          const { cls } = work(get())
          mapClass(cls.id, (c) => ({ ...c, activeChartId: id }))
          set({ selectedDesk: null, problems: [] })
        },

        /** New chart for the active class; copy=true starts from the current seating. */
        addChart: (name, copy) => {
          const { cls, chart } = work(get())
          const next = newChart(name || `Chart ${cls.charts.length + 1}`, copy ? { assignments: { ...chart.assignments }, locked: [...chart.locked] } : {})
          mapClass(cls.id, (c) => ({ ...c, charts: [...c.charts, next], activeChartId: next.id }))
          set({ selectedDesk: null, problems: [] })
        },

        renameChart: (id, name) => {
          const { cls } = work(get())
          mapClass(cls.id, (c) => ({ ...c, charts: c.charts.map((ch) => (ch.id === id ? { ...ch, name } : ch)) }))
        },

        deleteChart: (id) => {
          const { cls } = work(get())
          if (cls.charts.length <= 1) return set({ problems: ['Keep at least one chart.'] })
          mapClass(cls.id, (c) => {
            const charts = c.charts.filter((ch) => ch.id !== id)
            return { ...c, charts, activeChartId: c.activeChartId === id ? charts[0].id : c.activeChartId }
          })
          set({ selectedDesk: null })
        },

        replaceLibrary: (lib) => {
          const next = lib.classes.length ? lib : defaultLibrary()
          set({ rooms: next.rooms, classes: next.classes, activeClassId: next.activeClassId ?? next.classes[0].id, selectedDesk: null, problems: [] })
        },
        resetLibrary: () => get().replaceLibrary(defaultLibrary()),

        // ---- students ----
        addStudents: (names) => {
          const { students } = work(get())
          const added = names.map((n) => n.trim()).filter(Boolean).map((name) => ({ id: newId(), name, bannedZones: [] }))
          put({ students: [...students, ...added] })
        },

        removeStudent: (id) => put({ students: work(get()).students.filter((x) => x.id !== id), selectedDesk: null }),

        toggleBan: (id, zone) =>
          put({
            students: work(get()).students.map((x) =>
              x.id !== id
                ? x
                : { ...x, bannedZones: x.bannedZones.includes(zone) ? x.bannedZones.filter((z) => z !== zone) : [...x.bannedZones, zone] },
            ),
          }),

        // ---- room editing (the room is shared by every class that meets in it) ----
        /** Grow or shrink to n seats. Shrinking removes empty seats first, then unlocked, newest first. */
        setSeatCount: (n) => {
          const { room, assignments, locked } = work(get())
          const target = Math.min(MAX_SEATS, Math.max(1, Math.round(n) || 1))
          let next = { ...room, seats: [...room.seats] }
          if (target > next.seats.length) {
            while (next.seats.length < target) {
              const spot = findFreeSpot(next)
              if (!spot) return set({ problems: ['No more floor space. Move seats closer together to fit more.'] })
              next = { ...next, seats: [...next.seats, { id: newId(), ...spot, zones: [] }] }
            }
          } else {
            const taken = new Set(Object.keys(assignments))
            const rank = (seat) => (!taken.has(seat.id) ? 0 : !locked.includes(assignments[seat.id]) ? 1 : 2)
            const order = next.seats.map((seat, i) => ({ seat, i })).sort((a, b) => rank(a.seat) - rank(b.seat) || b.i - a.i)
            const drop = new Set(order.slice(0, next.seats.length - target).map((o) => o.seat.id))
            next = { ...next, seats: next.seats.filter((seat) => !drop.has(seat.id)) }
          }
          put({ room: next, problems: [], selectedDesk: null })
        },

        /** kind: 'seat' | 'fixture'. Ignored if the spot is taken or off the floor. */
        moveItem: (kind, id, x, y) => {
          const { room } = work(get())
          const key = kind === 'seat' ? 'seats' : 'fixtures'
          const item = room[key].find((i) => i.id === id)
          if (!item || !canPlace(room, id, x, y, item.w ?? 1, item.h ?? 1)) return
          put({ room: { ...room, [key]: room[key].map((i) => (i.id === id ? { ...i, x, y } : i)) } })
        },

        /** Add a piece of furniture in the first gap that fits; returns its id (or null if there's no space). */
        addFixture: (kind) => {
          const { room } = work(get())
          const t = FIXTURE_TYPES[kind]
          const spot = findFreeSpot(room, t.w, t.h)
          if (!spot) {
            set({ problems: [`No free space for a ${t.label.toLowerCase()}. Move things around to make room.`] })
            return null
          }
          const id = newId()
          put({ room: { ...room, fixtures: [...room.fixtures, { id, kind, ...spot, w: t.w, h: t.h }] }, problems: [] })
          return id
        },

        /** Resize or rotate a piece of furniture in place, if it still fits. patch: { w?, h? } */
        resizeFixture: (id, patch) => {
          const { room } = work(get())
          const f = room.fixtures.find((x) => x.id === id)
          if (!f) return
          const next = { ...f, ...patch }
          if (next.w < 1 || next.h < 1 || !canPlace(room, id, f.x, f.y, next.w, next.h)) {
            return set({ problems: ['There isn’t room for that. Move it or clear some space first.'] })
          }
          put({ room: { ...room, fixtures: room.fixtures.map((x) => (x.id === id ? next : x)) }, problems: [] })
        },

        removeFixture: (id) => {
          const { room } = work(get())
          put({ room: { ...room, fixtures: room.fixtures.filter((x) => x.id !== id) } })
        },

        /** mode: 'add' | 'remove' */
        paintZone: (seatId, zoneId, mode) => {
          const { room } = work(get())
          put({
            room: {
              ...room,
              seats: room.seats.map((seat) => {
                if (seat.id !== seatId) return seat
                const has = seat.zones.includes(zoneId)
                if (mode === 'add' && !has) return { ...seat, zones: [...seat.zones, zoneId] }
                if (mode === 'remove' && has) return { ...seat, zones: seat.zones.filter((z) => z !== zoneId) }
                return seat
              }),
            },
          })
        },

        addZone: (name) => {
          const { room } = work(get())
          const id = newId()
          const color = ZONE_COLORS[room.zones.length % ZONE_COLORS.length]
          put({ room: { ...room, zones: [...room.zones, { id, name: name || 'New zone', color }] } })
          return id
        },

        renameZone: (id, name) => {
          const { room } = work(get())
          put({ room: { ...room, zones: room.zones.map((z) => (z.id === id ? { ...z, name } : z)) } })
        },

        /** Zones belong to the room, so deleting one frees every class's students from it. */
        deleteZone: (id) =>
          set((s) => {
            const { room } = work(s)
            return {
              rooms: {
                ...s.rooms,
                [room.id]: {
                  ...room,
                  seats: room.seats.map((seat) => ({ ...seat, zones: seat.zones.filter((z) => z !== id) })),
                  zones: room.zones.filter((z) => z !== id),
                },
              },
              classes: s.classes.map((c) =>
                c.roomId === room.id
                  ? { ...c, students: c.students.map((x) => ({ ...x, bannedZones: x.bannedZones.filter((z) => z !== id) })) }
                  : c,
              ),
            }
          }),

        /** Back to the sample classroom for everyone who meets in this room; clears their zone restrictions. */
        resetRoom: () =>
          set((s) => {
            const { room } = work(s)
            const fresh = { ...room, ...sampleRoom() }
            return {
              rooms: { ...s.rooms, [room.id]: fresh },
              classes: s.classes.map((c) =>
                c.roomId === room.id
                  ? pruneClass({ ...c, students: c.students.map((x) => ({ ...x, bannedZones: [] })) }, fresh)
                  : c,
              ),
              selectedDesk: null,
            }
          }),

        // ---- seating ----
        toggleLock: (studentId) => {
          const { locked } = work(get())
          put({ locked: locked.includes(studentId) ? locked.filter((x) => x !== studentId) : [...locked, studentId] })
        },

        // First click selects a desk, second click moves/swaps into the other desk.
        clickDesk: (desk) => {
          const { selectedDesk, seatStudent } = get()
          const { assignments } = work(get())
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
          const { assignments, students, room, locked } = work(get())
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
          put({ assignments: next, problems, selectedDesk: null })
        },

        generate: () => {
          const { students, room, assignments, locked } = work(get())
          const res = generate(students, room, assignments, new Set(locked))
          if (res.ok) put({ assignments: res.assignments, problems: [], selectedDesk: null })
          else set({ problems: res.problems })
        },

        clearUnlocked: () => {
          const { assignments, locked } = work(get())
          const keep = {}
          for (const [d, id] of Object.entries(assignments)) if (locked.includes(id)) keep[d] = id
          put({ assignments: keep, problems: [], selectedDesk: null })
        },
      }
    },
    {
      name: 'seating-chart-v4',
      partialize: ({ rooms, classes, activeClassId }) => ({ rooms, classes, activeClassId }),
    },
  ),
)
