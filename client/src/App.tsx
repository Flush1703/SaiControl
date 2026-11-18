import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import Access from "./Access";
import PocketMoney from "./PocketMoney";
import Ledger, { checked } from "./Ledger";
import Planning from "./Planning";
import ProjectDrive, { createDriveSessions } from "./ProjectDrive";
import Dossier from "./Dossier";
import NewProject, { type ProjectDraft } from "./NewProject";
import MappedImport from "./MappedImport";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8081";

type Project = {
  id: string;
  name: string;
  referenceCode?: string;
  funder?: string;
  startsOn?: string;
  endsOn?: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
};

type Account = {
  id: string;
  accountCode: string;
  description: string;
  allocatedBudget: number;
};

const tabs = ["projects", "ledger", "dossier", "drive", "new-project"] as const;
type Tab = typeof tabs[number];
function readRoute() {
  const params = new URLSearchParams(window.location.search);
  const tab = tabs.find((item) => item === params.get("view")) ?? "projects";
  return { tab, projectId: params.get("project") };
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default function App() {
  const sessionKey = `saicontrol:session:${API_URL}`;
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey) ?? "");
  function login(value: string) {
    sessionStorage.setItem(sessionKey, value);
    setToken(value);
  }
  const logout = useCallback(() => {
    sessionStorage.removeItem(sessionKey);
    setToken("");
  }, [sessionKey]);
  return token
    ? <Workspace token={token} onLogout={logout} />
    : <Access apiUrl={API_URL} onLogin={login} />;
}

function Workspace({ token, onLogout }: { token: string; onLogout: () => void }) {
  const request = useCallback(async (url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) onLogout();
    return response;
  }, [token, onLogout]);

  const [driveSessions] = useState(createDriveSessions);
  const [route, setRoute] = useState(readRoute);
  const { tab } = route;

  function navigate(view: Tab, projectId = selectedId.current, replace = false) {
    const current = readRoute();
    if (!replace && view === current.tab && projectId === (current.projectId ?? selectedId.current)) return;
    const url = new URL(window.location.href);
    if (view === "projects") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    if (projectId) url.searchParams.set("project", projectId);
    else url.searchParams.delete("project");
    if (url.href === window.location.href) return;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setRoute(readRoute());
  }
  const [planVersion, setPlanVersion] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const selectedId = useRef<string | undefined>(undefined);
  const accountRequest = useRef(0);
  const projectRequest = useRef(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = async () => {
    const generation = ++projectRequest.current;
    setLoading(true);
    try {
      const response = await request(`${API_URL}/api/v1/projects`);
      if (!response.ok) throw new Error("Impossibile caricare i progetti.");
      const data = (await response.json()) as Project[];
      if (generation !== projectRequest.current) return;
      setProjects(data);

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore imprevisto.");
    } finally {
      if (generation === projectRequest.current) setLoading(false);
    }
  };

  const refreshAccounts = async (project: Project) => {
    if (selectedId.current !== project.id) return;
    const generation = ++accountRequest.current;
    try {
      const response = await request(`${API_URL}/api/v1/projects/${project.id}/financial-accounts`);
      if (!response.ok) throw new Error("Impossibile caricare il piano finanziario.");
      const data = (await response.json()) as Account[];
      if (generation === accountRequest.current) setAccounts(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore imprevisto.");
    }
  };

  const choose = async (project: Project) => {
    if (selectedId.current !== project.id) setAccounts([]);
    selectedId.current = project.id;
    setSelected(project);
    await refreshAccounts(project);
  };

  useEffect(() => { void loadProjects(); }, []);

  useEffect(() => {
    const restore = () => setRoute(readRoute());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const project = projects.find((item) => item.id === route.projectId) ?? projects[0];
    if (project && selectedId.current !== project.id) void choose(project);
  }, [projects, route.projectId]);

  async function createProject(draft: ProjectDraft) {
    const response = await checked(await request(`${API_URL}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        referenceCode: draft.referenceCode || null,
        funder: draft.funder || null,
        startsOn: draft.startsOn || null,
        endsOn: draft.endsOn || null,
      }),
    }));
    const project = (await response.json()) as Project;
    projectRequest.current++;
    setLoading(false);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    navigate("projects", project.id, true);
  }

  const addAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      const response = await request(`${API_URL}/api/v1/projects/${selected.id}/financial-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode: form.get("accountCode"),
          description: form.get("description"),
          allocatedBudget: Number(form.get("allocatedBudget")),
        }),
      });
      if (!response.ok) throw new Error("Il conto non è stato creato.");
      await refreshAccounts(selected);
      if (selectedId.current !== selected.id) return;
      element.reset();
      setPlanVersion((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore imprevisto.");
    }
  };

  return (
    <main className="shell">
      <header>
        <div className="brand"><img className="brand-mark" src="/saicontrol-logo.png" alt="" width="41" height="41" /><div><strong>SaiControl</strong><small>Rendicontazione SAI</small></div></div>
        <button className="secondary" onClick={async () => {
          try {
            await request(`${API_URL}/api/v1/access`, { method: "DELETE" });
          } finally {
            onLogout();
          }
        }}>Esci</button>
      </header>
      {tab !== "new-project" && <nav className="module-nav" aria-label="Moduli">
        <button aria-pressed={tab === "projects"} onClick={() => navigate("projects")}>Progetti e budget</button>
        <button aria-pressed={tab === "ledger"} onClick={() => navigate("ledger")}>Documenti</button>
        <button aria-pressed={tab === "dossier"} onClick={() => navigate("dossier")}>Fascicolo per progetto</button>
        <button aria-pressed={tab === "drive"} onClick={() => navigate("drive")}>Google Drive</button>
      </nav>}
      {error && <div className="alert">{error}<button onClick={() => setError(null)}>×</button></div>}
      {tab === "new-project" && <NewProject cancel={() => navigate("projects")} save={createProject} />}
      {tab === "ledger" && <Ledger api={API_URL} projects={projects} request={request} refreshProjects={loadProjects} />}
      {(tab === "dossier" || tab === "drive") && <section className="module-form">
        <label>Progetto<select value={selected?.id ?? ""} onChange={(event) => {
          const project = projects.find((item) => item.id === event.target.value);
          if (project) navigate(tab, project.id);
        }}>
          <option value="" disabled>Seleziona un progetto</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {tab === "drive" && selected && <ProjectDrive key={selected.id} project={selected} sessions={driveSessions} />}
        {tab === "dossier" && selected && <Dossier key={selected.id}
          base={`${API_URL}/api/v1/projects/${selected.id}/dossier`} request={request} />}
      </section>}
      {tab === "projects" && <>
      <section className="card module-form" aria-labelledby="projects-title">
        <div className="card-title">
          <div>
            <h1 id="projects-title" className="projects-title">Progetti SAI</h1>
            <p>{loading ? "Caricamento…" : `${projects.length} ${projects.length === 1 ? "progetto registrato" : "progetti registrati"}`}</p>
          </div>
          <div className="wizard-actions">
            <button className="secondary" disabled={loading} onClick={() => void loadProjects()}>Aggiorna</button>
            <button onClick={() => { setError(null); navigate("new-project"); }}>Nuovo progetto</button>
          </div>
        </div>
        {projects.length === 0 && !loading
          ? <div className="empty">Crea il primo progetto per iniziare.</div>
          : <div className="project-list">
            {projects.map((project) => (
              <button key={project.id} className={selected?.id === project.id ? "project active" : "project"}
                aria-pressed={selected?.id === project.id} onClick={() => { if (selectedId.current !== project.id) navigate(tab, project.id); }}>
                <strong>{project.name}</strong>
                <span>{project.referenceCode || "Senza codice"} · {project.funder || "Ente da definire"}</span>
                <em>{project.status}</em>
              </button>
            ))}
          </div>}
      </section>
      {selected && <section className="card plan"><div className="card-title"><div><p className="eyebrow">PIANO FINANZIARIO</p><h2>{selected.name}</h2></div><strong>{euro.format(accounts.reduce((sum, account) => sum + Number(account.allocatedBudget), 0))}</strong></div><div className="accounts">{accounts.length ? accounts.map((account) => <div key={account.id}><code>{account.accountCode}</code><span>{account.description}</span><strong>{euro.format(account.allocatedBudget)}</strong></div>) : <div className="empty">Nessun conto: aggiungi la prima voce di budget.</div>}</div><form className="account-form" onSubmit={addAccount}><input required name="accountCode" placeholder="Codice conto" /><input required name="description" placeholder="Descrizione" /><input required min="0" step="0.01" name="allocatedBudget" type="number" placeholder="Budget" /><button>Aggiungi conto</button></form>
        <MappedImport key={selected.id} api={API_URL} request={request} title="Piano finanziario XLSX, XLSM o CSV"
          fields={["codice di conto", "descrizione", "budget"]} onImport={async (body) => {
            const response = await checked(await request(`${API_URL}/api/v1/projects/${selected.id}/financial-accounts/import`, { method: "POST", body }));
            const result = await response.json();
            await refreshAccounts(selected);
            if (selectedId.current === selected.id) setPlanVersion((value) => value + 1);
            return `Importati ${result.imported} conti.`;
          }} />
      </section>}
      {selected && <Planning key={`${selected.id}-${planVersion}`}
        base={`${API_URL}/api/v1/projects/${selected.id}/planning`} request={request}
        changed={() => void refreshAccounts(selected)} />}
      {selected && <PocketMoney key={selected.id} project={selected.name}
        url={`${API_URL}/api/v1/projects/${selected.id}/pocket-money`} request={request} />}
      </>}
    </main>
  );
}

