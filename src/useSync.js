import { useCallback, useEffect, useRef, useState } from 'react'
import { cloudEnabled, deleteAllMine, fetchRows, pushDiff, supabase } from './cloud'
import { diffRows, fromRows, isBlank, isEmptyDiff, mergeLibraries, toRows } from './library'
import { useStore } from './store'

const libOf = (s) => ({ rooms: s.rooms, classes: s.classes, activeClassId: s.activeClassId })

/**
 * Account + cloud save. The browser store stays the working copy; this loads it from Supabase on sign-in and
 * pushes changes (diffed against the last known server state) shortly after edits stop.
 */
export function useSync() {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | saving | saved | error
  const [error, setError] = useState('')
  const snapshot = useRef(null) // rows as last seen on the server
  const ready = useRef(false) // initial load finished: safe to save
  const flushRef = useRef(async () => {})

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  // Load on sign-in.
  useEffect(() => {
    snapshot.current = null
    ready.current = false
    if (!supabase || !user) return setStatus('idle')
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      try {
        const cloud = fromRows(await fetchRows())
        if (cancelled) return
        const local = libOf(useStore.getState())
        let next = cloud
        if (cloud.classes.length === 0) next = local
        else if (!isBlank(local) && confirm('Add the classes on this device to your account?\n\nCancel shows only your saved classes (and removes these from this device).')) {
          next = mergeLibraries(cloud, local)
        }
        snapshot.current = toRows(cloud, user.id)
        useStore.getState().replaceLibrary(next)
        ready.current = true
        setStatus('saved')
        setError('')
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setError(e.message ?? String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Save (debounced) whenever the library changes.
  useEffect(() => {
    if (!supabase || !user) return
    let timer
    let saving = false
    let again = false
    const run = async () => {
      if (!ready.current) return
      if (saving) {
        again = true
        return
      }
      saving = true
      try {
        do {
          again = false
          const rows = toRows(libOf(useStore.getState()), user.id)
          const diff = diffRows(snapshot.current, rows)
          if (isEmptyDiff(diff)) break
          setStatus('saving')
          await pushDiff(diff)
          snapshot.current = rows
        } while (again)
        setStatus('saved')
        setError('')
      } catch (e) {
        setStatus('error')
        setError(e.message ?? String(e))
      } finally {
        saving = false
      }
    }
    flushRef.current = async () => {
      clearTimeout(timer)
      await run()
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(run, 1200)
    }
    const hide = () => document.visibilityState === 'hidden' && run()
    const unsub = useStore.subscribe(schedule)
    document.addEventListener('visibilitychange', hide)
    return () => {
      unsub()
      document.removeEventListener('visibilitychange', hide)
      clearTimeout(timer)
      flushRef.current = async () => {}
    }
  }, [user?.id])

  const signInGoogle = useCallback(
    () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
    [],
  )

  const signInEmail = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await flushRef.current()
    await supabase.auth.signOut()
    useStore.getState().resetLibrary() // don't leave a teacher's data on a shared computer
  }, [])

  const deleteMyData = useCallback(async () => {
    await deleteAllMine()
    await supabase.auth.signOut()
    useStore.getState().resetLibrary()
  }, [])

  return { enabled: cloudEnabled, user, status, error, signInGoogle, signInEmail, signOut, deleteMyData }
}
