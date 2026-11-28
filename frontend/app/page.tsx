"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import logo from "./icon.png";
import { LogOut, PanelsTopLeft } from "lucide-react";
import { Board } from "./board/Board";
import styles from "./page.module.css";

export default function Home() {
  const [session, setSession] = useState<"checking" | "signedIn" | "signedOut">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        const response = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
        if (!response.ok && response.status !== 401) throw new Error();
        setSession(response.ok ? "signedIn" : "signedOut");
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not check your session. Try signing in again.");
        setSession("signedOut");
      }
    }
    void checkSession();
    return () => controller.abort();
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fields.get("username"), password: fields.get("password") }),
      });
      if (response.status === 401) {
        setError("Incorrect username or password.");
        return;
      }
      if (!response.ok) throw new Error();
      setSession("signedIn");
    } catch {
      setError("Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setSession("signedOut");
    } catch {
      setError("Could not log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.nav}>
          <div className={styles.identity}>
            <Image src={logo} width={32} height={32} alt="" unoptimized />
            <span className={styles.wordmark}>Fieldwork</span>
            <span className={styles.workspace}>Workspace</span>
          </div>
          {session === "signedIn" && (
            <button className={styles.session} onClick={signOut} disabled={busy}>
              <LogOut size={16} aria-hidden="true" /> Log out
            </button>
          )}
        </div>
      </header>
      <main className={styles.main}>
        {session === "checking" && <p role="status">Checking session…</p>}
        {session === "signedOut" && (
          <form className={styles.signIn} onSubmit={signIn}>
            <h1>Sign in to Fieldwork</h1>
            <label>Username<input name="username" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p role="alert">{error}</p>}
            <button type="submit" disabled={busy}>Sign in</button>
          </form>
        )}
        {session === "signedIn" && (
          <>
            {error && <p role="alert">{error}</p>}
            <header className={styles.project}>
              <div className={styles.projectText}>
                <div className={styles.projectLabel}>
                  <PanelsTopLeft size={15} aria-hidden="true" /> Project board
                </div>
                <h1>Website launch</h1>
                <p>Design, content, and development for our new studio website.</p>
              </div>
              <div className={styles.art} aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </div>
            </header>
            <Board onSignedOut={() => {
              setError("Your session has ended. Sign in again.");
              setSession("signedOut");
            }} />
          </>
        )}
      </main>
    </>
  );
}
