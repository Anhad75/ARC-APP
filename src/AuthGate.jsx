import { useState } from "react";
import App from "./App.jsx";
import { clearLocalSession, getLocalSecurityQuestion, getLocalSession, registerLocalUser, resetLocalPassword, signInLocalUser } from "./localAuth.js";

function AuthGate() {
  const [session, setSession] = useState(getLocalSession);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [mode, setMode] = useState("signin");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      if (mode === "register") {
        const user = await registerLocalUser({ phone, password, securityQuestion, securityAnswer });
        setSession(user);
      } else if (mode === "forgot") {
        if (!question) {
          setQuestion(await getLocalSecurityQuestion(phone));
        } else {
          await resetLocalPassword({ phone, securityAnswer, password });
          setMode("signin");
          setQuestion("");
          setSecurityAnswer("");
          setPassword("");
          setError("Password reset. You can sign in now.");
        }
      } else {
        setSession(await signInLocalUser(phone, password));
      }
    } catch (submitError) {
      setError(submitError.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  function signOut() {
    clearLocalSession();
    setSession(null);
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setQuestion("");
    setError("");
    setPassword("");
    setSecurityAnswer("");
  }

  if (session) return <App user={session} onSignOut={signOut} />;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">FN</div>
        <span className="section-kicker">FIELD NOTES</span>
        <h1>{mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in with your mobile"}</h1>
        <p className="auth-copy">Your account and field records stay on this device. Sign in with your mobile number and password.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Mobile number<input type="tel" inputMode="tel" placeholder="9876543210 or +919876543210" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
          {mode === "register" && <label>Custom security question<input value={securityQuestion} onChange={(event) => setSecurityQuestion(event.target.value)} placeholder="e.g. What was your first field site?" required /></label>}
          {mode === "forgot" && question && <label>{question}<input value={securityAnswer} onChange={(event) => setSecurityAnswer(event.target.value)} required /></label>}
          {(mode !== "forgot" || question) && <label>{mode === "forgot" ? "New password" : "Password"}<input type="password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
          {mode === "register" && <label>Security answer<input value={securityAnswer} onChange={(event) => setSecurityAnswer(event.target.value)} required /></label>}
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Please wait..." : mode === "register" ? "Create account" : mode === "forgot" ? question ? "Reset password" : "Find my question" : "Sign in"}</button>
        </form>
        {mode === "signin" && <button className="auth-switch" onClick={() => changeMode("register")}>Create an account</button>}
        {mode === "signin" && <button className="auth-switch" onClick={() => changeMode("forgot")}>Forgot password?</button>}
        {mode !== "signin" && <button className="auth-switch" onClick={() => changeMode("signin")}>Back to sign in</button>}
      </section>
    </main>
  );
}

export default AuthGate;
