import { FormEvent, useEffect, useState } from "react";

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const drive = "https://www.googleapis.com/drive/v3";
const folderType = "application/vnd.google-apps.folder";
const fileFields = "id,name,webViewLink";
const maxBytes = 5_000_000;
type DriveFile = { id: string; name: string; webViewLink?: string };
type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string };
type DriveConnection = { token: string; folder: DriveFile; email: string; expiresAt: number };
export const createDriveSessions = () => new Map<string, DriveConnection>();
type GoogleWindow = Window & { google?: { accounts: { oauth2: {
  initTokenClient: (config: {
    client_id: string; scope: string; hint: string;
    callback: (response: TokenResponse) => void; error_callback: (error: { type?: string }) => void;
  }) => { requestAccessToken: (options: { prompt: string }) => void };
} } } };

function oauth() {
  return (window as GoogleWindow).google?.accounts.oauth2;
}

async function googleRequest<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) throw new Error("Sessione Google scaduta. Scollega e accedi di nuovo.");
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const reason = result?.error?.errors?.[0]?.reason ?? result?.error?.status;
    throw new Error(`Google API ha rifiutato l’operazione (HTTP ${response.status}${reason ? `, ${reason}` : ""}).`);
  }
  return response.json();
}

async function list(token: string, query: string) {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const parameters = new URLSearchParams({ q: `trashed = false and (${query})`, fields: `nextPageToken,files(${fileFields})`, pageSize: "100" });
    if (pageToken) parameters.set("pageToken", pageToken);
    const page = await googleRequest<{ files: DriveFile[]; nextPageToken?: string }>(`${drive}/files?${parameters}`, token);
    files.push(...page.files);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

export default function ProjectDrive({ project, sessions }: {
  project: { id: string; name: string };
  sessions: ReturnType<typeof createDriveSessions>;
}) {
  const emailKey = `saicontrol:drive-email:${project.id}`;
  const [email, setEmail] = useState(() => sessionStorage.getItem(emailKey) ?? "");
  const [ready, setReady] = useState(Boolean(oauth()));
  const [connection, setConnection] = useState(() => {
    const saved = sessions.get(project.id);
    return saved && saved.expiresAt > Date.now() ? saved : undefined;
  });
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!clientId || oauth()) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setReady(Boolean(oauth()));
    script.onerror = () => setError("Impossibile caricare il servizio di accesso Google.");
    document.head.append(script);
    return () => { script.remove(); };
  }, []);

  useEffect(() => {
    if (!connection) return;
    let active = true;
    const expire = () => {
      if (sessions.get(project.id) === connection) sessions.delete(project.id);
      setConnection(undefined);
      setFiles([]);
      setMessage("");
      setError("Sessione Google scaduta. Accedi di nuovo per continuare.");
    };
    const timer = window.setTimeout(expire, Math.max(0, connection.expiresAt - Date.now()));
    list(connection.token, `'${connection.folder.id}' in parents`).then((items) => {
      if (active) setFiles((current) => {
        const ids = new Set(items.map((item) => item.id));
        return [...items, ...current.filter((item) => !ids.has(item.id))];
      });
    }).catch((cause: Error) => {
      if (active) setError(cause.message);
    });
    return () => { active = false; window.clearTimeout(timer); };
  }, [connection, project.id, sessions]);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = oauth();
    if (!service || !clientId) return;
    const expected = email.trim().toLowerCase();
    setError("");
    setMessage("");
    setBusy(true);
    let receivedResponse = false;
    const fail = (code: string) => {
      const messages: Record<string, string> = {
        popup_failed_to_open: "Il browser ha bloccato la finestra di Google. Consenti i popup per SaiControl e riprova.",
        popup_closed: "SaiControl non ha ricevuto la risposta dalla finestra Google. Riprova da una scheda del browser aperta direttamente su SaiControl.",
        access_denied: "Google ha negato il consenso. Verifica l’account di test e autorizza l’accesso a Drive.",
      };
      console.warn("[SaiControl] Errore OAuth Google", { code, origin: window.location.origin });
      setError(messages[code] ?? `Accesso Google non riuscito (${code}).`);
      setBusy(false);
    };
    try {
      service.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
        hint: expected,
        error_callback: (error) => {
          if (!receivedResponse) fail(error.type ?? "unknown");
        },
        callback: async ({ access_token: token, expires_in, error }) => {
          receivedResponse = true;
          setError("");
          setBusy(true);
          if (error || !token) { fail(error ?? "missing_token"); return; }
          try {
            const user = await googleRequest<{ email: string; verified_email: boolean }>(
              "https://www.googleapis.com/oauth2/v2/userinfo", token);
            if (!user.verified_email || user.email.toLowerCase() !== expected) {
              throw new Error("Accedi con l’indirizzo Google indicato per questo progetto.");
            }
            const folders = await list(token, `mimeType = '${folderType}' and appProperties has { key='saicontrolProject' and value='${project.id}' }`);
            if (folders.length > 1) throw new Error("Sono presenti più cartelle SaiControl per il progetto. Controllale in Google Drive.");
            const folder = folders[0] ?? await googleRequest<DriveFile>(`${drive}/files?fields=${fileFields}`, token, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: `SaiControl · ${project.name}`, mimeType: folderType,
                appProperties: { saicontrolProject: project.id },
              }),
            });
            sessionStorage.setItem(emailKey, user.email);
            const connected = { token, folder, email: user.email,
              expiresAt: Date.now() + (Number(expires_in) || 3600) * 1000 };
            sessions.set(project.id, connected);
            setConnection(connected);
          } catch (cause) {
            setError((cause as Error).message);
          } finally { setBusy(false); }
        },
      }).requestAccessToken({ prompt: "select_account" });
    } catch { fail("initialization_failed"); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    setError("");
    setMessage("");
    if (selected.some((file) => file.size > maxBytes)) {
      setError("Seleziona file fino a 5 MB ciascuno.");
      return;
    }
    setBusy(true);
    const failed: string[] = [];
    let count = 0;
    try {
      for (const file of selected) {
        const boundary = crypto.randomUUID();
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
          JSON.stringify({ name: file.name, parents: [connection.folder.id] }),
          `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
          file, `\r\n--${boundary}--\r\n`,
        ]);
        try {
          const stored = await googleRequest<DriveFile>(
            `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fileFields}`, connection.token, {
              method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
            });
          setFiles((current) => [...current, stored]);
          count++;
        } catch (cause) { failed.push(`${file.name}: ${(cause as Error).message}`); }
      }
      if (count) setMessage(`File caricati: ${count}.`);
      if (failed.length) setError(failed.join(" "));
      form.reset();
    } finally { setBusy(false); }
  }

  return <section className="card plan planning">
    <h2>Google Drive · {project.name}</h2>
    {!clientId && <p>Configura il Client ID OAuth di Google per attivare questa scheda.</p>}
    {error && <p role="alert" className="alert">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {clientId && !connection && <form className="filter-bar" onSubmit={connect}>
      <label>Account Google del progetto<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button disabled={!ready || busy}>{busy ? "Connessione in corso…" : "Accedi con Google"}</button>
    </form>}
    {connection && <>
      <p>Account collegato: {connection.email}</p>
      <a href={`https://drive.google.com/drive/folders/${encodeURIComponent(connection.folder.id)}`} target="_blank" rel="noreferrer">Apri cartella in Google Drive</a>
      {" "}<button type="button" className="secondary" disabled={busy} onClick={() => {
        sessions.delete(project.id);
        setConnection(undefined); setFiles([]); setError(""); setMessage("");
      }}>Scollega sessione</button>
      <form className="filter-bar" onSubmit={upload}>
        <label>File da caricare (max 5 MB ciascuno)<input type="file" name="files" multiple required disabled={busy} /></label>
        <button disabled={busy}>{busy ? "Caricamento…" : "Carica su Google Drive"}</button>
      </form>
      {files.length > 0 ? <ul>{files.map((file) => <li key={file.id}><a
        href={`https://drive.google.com/open?id=${encodeURIComponent(file.id)}`}
        target="_blank" rel="noreferrer">{file.name}</a></li>)}</ul> : <p className="module-form">Nessun file visibile a SaiControl in questa cartella.</p>}
    </>}
  </section>;
}
