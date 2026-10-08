import { useState } from 'react'

const STATUS = { loading: 'Loading…', saving: 'Saving…', saved: '✓ Saved', error: '⚠ Not saved' }

/** Sign in / account menu. Hidden-ish when Supabase isn't configured (local-only mode). */
export default function Account({ sync }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  if (!sync.enabled) {
    return (
      <span className="hint account" title="Add Supabase keys to .env to enable accounts. See README.">
        Saved on this device only
      </span>
    )
  }

  if (sync.user) {
    return (
      <div className="account">
        <span className={`hint status ${sync.status}`} title={sync.error}>
          {STATUS[sync.status]}
        </span>
        <span className="hint">{sync.user.email}</span>
        <button onClick={sync.signOut}>Sign out</button>
        <button
          className="link"
          onClick={() =>
            confirm('Permanently delete all your saved classes, students and charts, and sign out?') && sync.deleteMyData()
          }
        >
          Delete my saved data
        </button>
      </div>
    )
  }

  const sendLink = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await sync.signInEmail(email.trim())
      setSent(true)
    } catch (ex) {
      setErr(ex.message ?? String(ex))
    }
  }

  return (
    <div className="account">
      <span className="hint">Saved on this device only</span>
      <button onClick={() => setOpen(true)}>Sign in to save</button>
      {open && (
        <div className="backdrop" onClick={() => setOpen(false)}>
          <div className="dialog" role="dialog" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
            <button className="link close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
            <h2>Sign in</h2>
            <p className="hint">Keep your classes and come back to them from any device. No password needed.</p>
            <button className="primary wide" onClick={sync.signInGoogle}>
              Continue with Google
            </button>
            <div className="or">or</div>
            {sent ? (
              <p>Check your email for a sign-in link.</p>
            ) : (
              <form onSubmit={sendLink} className="email-form">
                <input type="email" required placeholder="you@school.org" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit">Email me a link</button>
              </form>
            )}
            {err && <p className="err">{err}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
