import { FormEvent, useState } from "react";

export default function Access({ apiUrl, onLogin }: { apiUrl: string; onLogin: (token: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const credentials = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/access`, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (response.status === 401) throw new Error("Nome utente o password non validi.");
      if (response.status === 503) throw new Error("Accesso non configurato. Contatta l’amministratore.");
      if (!response.ok) throw new Error("Accesso temporaneamente indisponibile.");
      onLogin((await response.json()).token);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "TimeoutError") {
        setError("L’API non ha risposto entro 45 secondi. Se il servizio Render si sta avviando, attendi e riprova.");
      } else {
        setError(cause instanceof TypeError ? "Impossibile raggiungere l’API di SaiControl. Riprova." : (cause as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="access">
    <section className="access-cover">
      <div className="brand"><img className="brand-mark" src="/saicontrol-logo.png" alt="" width="41" height="41" /><strong>SaiControl</strong></div>
      <div className="cover-copy">
        <p className="eyebrow">GESTIONALE SAI</p>
        <h1>La gestione dei progetti SAI.</h1>
        <p>Piani finanziari e rendicontazione in un unico spazio di lavoro.</p>
      </div>
      <small>Sistema di Accoglienza e Integrazione</small>
    </section>
    <section className="access-body">
      <div className="access-form">
        <p className="eyebrow">AREA RISERVATA</p>
        <h2>Accedi al gestionale</h2>
        <p>Inserisci le credenziali della tua organizzazione.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">Nome utente</label>
          <input id="username" name="username" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required />
            <button type="button" className="secondary" onClick={() => setVisible(!visible)}>{visible ? "Nascondi" : "Mostra"}</button>
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          <button className="access-submit" disabled={busy}>{busy ? "Accesso in corso…" : "Accedi"}</button>
        </form>
      </div>
    </section>
  </main>;
}
