import { useEffect, useState } from "react"
import App from "./App.jsx"

const AUTH_URL = import.meta.env.VITE_AUTH_URL || ""

async function getSession() {
  const response = await fetch(`${AUTH_URL}/auth/session`, { credentials: "include" })
  if (!response.ok) throw new Error("Auth server is unavailable")
  return response.json()
}

async function submitAuthForm(path, values) {
  const csrfResponse = await fetch(`${AUTH_URL}/auth/csrf`, { credentials: "include" })
  if (!csrfResponse.ok) throw new Error("Auth server is unavailable")
  const { csrfToken } = await csrfResponse.json()
  if (!csrfToken) throw new Error("Could not initialize the secure auth request")
  const form = document.createElement("form")
  form.method = "POST"
  form.action = `${AUTH_URL}${path}`
  form.hidden = true
  for (const [name, value] of Object.entries({ csrfToken, callbackUrl: window.location.origin, ...values })) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

function AuthGate() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [securityQuestion, setSecurityQuestion] = useState("")
  const [securityAnswer, setSecurityAnswer] = useState("")
  const [mode, setMode] = useState("signin")
  const [question, setQuestion] = useState("")
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("error") ? "Sign-in failed. Check your mobile number and password." : "")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSession().then(setSession).catch(() => setError("Auth server is unavailable")).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) window.history.replaceState({}, "", window.location.pathname)
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (submitting) return
    setError("")
    setSubmitting(true)
    try {
      if (mode === "register") {
        const response = await fetch(`${AUTH_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone, password, securityQuestion, securityAnswer }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
      } else if (mode === "forgot") {
        if (!question) {
          const response = await fetch(`${AUTH_URL}/api/auth/forgot/question`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error)
          setQuestion(result.question)
          return
        }
        const response = await fetch(`${AUTH_URL}/api/auth/forgot/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, securityAnswer, password }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        setMode("signin")
        setQuestion("")
        setSecurityAnswer("")
        setError("Password reset. You can sign in now.")
        return
      }
      await submitAuthForm("/auth/callback/credentials", { phone, password })
    } catch (submitError) {
      setError(submitError.message || "Could not create your account")
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    setError("")
    try {
      await submitAuthForm("/auth/signout", {})
    } catch (signOutError) {
      setError(signOutError.message)
      window.alert(signOutError.message)
    }
  }

  if (loading) return <div className="auth-loading">Loading Field Notes...</div>
  if (session?.user) return <App user={session.user} onSignOut={signOut} />

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">FN</div>
        <span className="section-kicker">FIELD NOTES</span>
        <h1>{mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in with your mobile"}</h1>
        <p className="auth-copy">Use your mobile number and password to access your field archive.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Mobile number<input type="tel" inputMode="tel" placeholder="9876543210 or +919876543210" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
          {mode === "register" && <label>Custom security question<input value={securityQuestion} onChange={(event) => setSecurityQuestion(event.target.value)} placeholder="e.g. What was your first field site?" required /></label>}
          {mode === "forgot" && question && <label>{question}<input value={securityAnswer} onChange={(event) => setSecurityAnswer(event.target.value)} required /></label>}
          {mode !== "forgot" || question ? <label> {mode === "forgot" ? "New password" : "Password"}<input type="password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /></label> : null}
          {mode === "register" && <label>Security answer<input value={securityAnswer} onChange={(event) => setSecurityAnswer(event.target.value)} required /></label>}
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait..." : mode === "register" ? "Create account" : mode === "forgot" ? question ? "Reset password" : "Find my question" : "Sign in"}</button>
        </form>
        {mode === "signin" && <button className="auth-switch" onClick={() => { setMode("register"); setError("") }}>Create an account</button>}
        {mode === "signin" && <button className="auth-switch" onClick={() => { setMode("forgot"); setError("") }}>Forgot password?</button>}
        {mode !== "signin" && <button className="auth-switch" onClick={() => { setMode("signin"); setQuestion(""); setError("") }}>Back to sign in</button>}
      </section>
    </main>
  )
}

export default AuthGate
