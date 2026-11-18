import { Fragment, FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { planOverview, projectMetadata, projectStatus } from "./projectDashboard";
import { createProjectReads } from "./projectReads";
import { groupSaiAccounts } from "./saiBudget";
import Access from "./Access";
import PocketMoney from "./PocketMoney";
import Ledger, { checked } from "./Ledger";
import Planning from "./Planning";
import ProjectDrive, { createDriveSessions } from "./ProjectDrive";
import AnnualReporting from "./AnnualReporting";
import SaiChecklist from "./SaiChecklist";
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
  const [reads] = useState(createProjectReads);
  const [openPanel, setOpenPanel] = useState<"planning" | "pocket">();
  const request = useCallback(async (url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const method = options?.method ?? "GET";
    const load = () => fetch(url, { ...options, headers });
    const response = method === "GET" && /\/projects\/[^/]+\/(financial-accounts|planning|pocket-money)$/.test(url)
      ? await reads.read(url, load)
      : await load();
    if (method !== "GET" && response.ok) reads.clear();
    if (response.status === 401) onLogout();
    return response;
  }, [token, onLogout, reads]);

  const [driveSessions] = useState(createDriveSessions);
  const [route, setRoute] = useState(readRoute);
  const { tab } = route;

  function navigate(view: Tab, projectId = selected?.id, replace = false) {
    const current = readRoute();
    if (!replace && view === current.tab && projectId === (current.projectId ?? selected?.id)) return;
    const url = new URL(window.location.href);
    if (view === "projects") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    if (projectId) url.searchParams.set("project", projectId);
    else url.searchParams.delete("project");
    if (url.href === window.location.href) return;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    applyRoute();
  }
  const [planVersion, setPlanVersion] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const selected = projects.find((project) => project.id === route.projectId) ?? projects[0];
  const selectedId = useRef<string | undefined>(undefined);
  const accountRequest = useRef(0);
  const projectRequest = useRef(0);
  const [accountData, setAccountData] = useState<{ projectId: string; accounts: Account[]; loading: boolean }>();
  const accounts = accountData?.projectId === selected?.id ? accountData?.accounts ?? [] : [];
  const accountsLoading = Boolean(selected && (accountData?.projectId !== selected.id || accountData.loading));
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
    setAccountData((current) => ({
      projectId: project.id, accounts: current?.projectId === project.id ? current.accounts : [], loading: true,
    }));
    try {
      const response = await request(`${API_URL}/api/v1/projects/${project.id}/financial-accounts`);
      if (!response.ok) throw new Error("Impossibile caricare il piano finanziario.");
      const data = (await response.json()) as Account[];
      if (generation === accountRequest.current) setAccountData({ projectId: project.id, accounts: data, loading: false });
    } catch (cause) {
      if (generation === accountRequest.current) setError(cause instanceof Error ? cause.message : "Errore imprevisto.");
    } finally {
      if (generation === accountRequest.current) {
        setAccountData((current) => current?.projectId === project.id ? { ...current, loading: false } : current);
      }
    }
  };

  function applyRoute() {
    accountRequest.current++;
    setError(null);
    setOpenPanel(undefined);
    setRoute(readRoute());
  }

  useEffect(() => { void loadProjects(); }, []);

  useEffect(() => {
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, []);

  useEffect(() => {
    selectedId.current = selected?.id;
    if (tab === "projects" && selected) void refreshAccounts(selected);
    return () => { accountRequest.current++; };
  }, [tab, route.projectId, selected?.id]);

  async function createProject(draft: ProjectDraft) {
    const origin = window.location.href;
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
    if (window.location.href === origin) navigate("projects", project.id, true);
  }

  const addAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const origin = window.location.href;
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
      if (window.location.href !== origin) return;
      await refreshAccounts(selected);
      if (selectedId.current !== selected.id) return;
      element.reset();
      setPlanVersion((value) => value + 1);
    } catch (cause) {
      if (window.location.href === origin) setError(cause instanceof Error ? cause.message : "Errore imprevisto.");
    }
  };

  const overview = planOverview(accounts, accountsLoading);

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
      <Fragment key={`${tab}:${selected?.id ?? ""}`}>
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
        {tab === "dossier" && selected && <AnnualReporting key={selected.id}
          base={`${API_URL}/api/v1/projects/${selected.id}/annual-report`} request={request} />}
        {tab === "dossier" && selected && <SaiChecklist key={selected.id}
          base={`${API_URL}/api/v1/projects/${selected.id}/reporting-checklist`} request={request} />}
        {tab === "dossier" && selected && <Dossier key={selected.id}
          base={`${API_URL}/api/v1/projects/${selected.id}/dossier`} request={request} />}
      </section>}
      {tab === "projects" && <div className="project-dashboard">
      <section className="card project-directory" aria-labelledby="projects-title">
        <div className="card-title">
          <div>
            <h1 id="projects-title" className="projects-title">Progetti SAI</h1>
            <p>{loading ? "Caricamento…" : `${projects.length} ${projects.length === 1 ? "progetto registrato" : "progetti registrati"}`}</p>
          </div>
          <div className="wizard-actions">
            <button className="secondary" disabled={loading} onClick={() => { reads.clear(); void loadProjects(); if (selected) { void refreshAccounts(selected); setPlanVersion((value) => value + 1); } }}>Aggiorna</button>
            <button onClick={() => { setError(null); navigate("new-project"); }}>Nuovo progetto</button>
          </div>
        </div>
        {projects.length === 0 && !loading
          ? <div className="empty">Crea il primo progetto per iniziare.</div>
          : <div className="project-list">
            {projects.map((project) => (
              <button key={project.id} className={selected?.id === project.id ? "project active" : "project"}
                aria-pressed={selected?.id === project.id} onClick={() => { if (selected?.id !== project.id) navigate(tab, project.id); }}>
                <strong>{project.name}</strong>
                <span>{projectMetadata(project)}</span>
                <em>{projectStatus(project.status)}</em>
              </button>
            ))}
          </div>}
      </section>
      {selected && <div className="project-workspace">
      <section className="card" aria-label="Progetto selezionato">
        <div className="card-title"><div><h2>{selected.name}</h2>
          {projectMetadata(selected) && <p>{projectMetadata(selected)}</p>}</div>
          <small className="project-status">{projectStatus(selected.status)}</small>
        </div>
        <dl className="allocation-summary project-overview">
          <div><dt>Budget del piano</dt><dd>{overview.total === null ? "—" : euro.format(overview.total)}</dd></div>
          <div><dt>Conti di spesa</dt><dd>{overview.total === null ? "—" : overview.count}</dd></div>
        </dl>
      </section>
      <section className="card plan" id="piano-finanziario">
        <h2>Piano finanziario preventivo</h2>
        {!accounts.length && <p role="status">{overview.emptyMessage}</p>}
        {groupSaiAccounts(accounts).map((group) => <section key={group.code}>
          <h3>{group.code && `${group.code} · `}{group.name}</h3>
          <div className="accounts">{group.accounts.map((account) => <div key={account.id}>
            <code>{account.accountCode}</code><span>{account.description}</span><strong>{euro.format(account.allocatedBudget)}</strong>
          </div>)}</div>
        </section>)}
        <details><summary>Aggiungi un conto manualmente</summary>
          <form className="account-form module-form" onSubmit={addAccount}>
            <label>Codice conto<input required name="accountCode" /></label>
            <label>Descrizione<input required name="description" /></label>
            <label>Budget (€)<input required min="0" step="0.01" name="allocatedBudget" type="number" /></label>
            <button>Aggiungi conto</button>
          </form>
        </details>
        <MappedImport key={selected.id} api={API_URL} request={request} title="Piano finanziario XLSX, XLSM o CSV"
          fields={["codice di conto", "descrizione", "budget"]} onImport={async (body) => {
            const response = await checked(await request(`${API_URL}/api/v1/projects/${selected.id}/financial-accounts/import`, { method: "POST", body }));
            const result = await response.json();
            await refreshAccounts(selected);
            if (selectedId.current === selected.id) setPlanVersion((value) => value + 1);
            return `Importati ${result.imported} conti.`;
          }} />
      </section>
      <details className="card plan dashboard-panel" key={`${selected.id}-planning`} open={openPanel === "planning"}>
        <summary onClick={(event) => {
          event.preventDefault();
          setOpenPanel((current) => current === "planning" ? undefined : "planning");
        }}>Situazione contabile e rimodulazioni</summary>
        {openPanel === "planning" && <Planning key={`${selected.id}-${planVersion}`}
          base={`${API_URL}/api/v1/projects/${selected.id}/planning`} request={request}
          changed={() => void refreshAccounts(selected)} />}
      </details>
      <details className="card plan pocket-panel dashboard-panel" key={`${selected.id}-pocket`} open={openPanel === "pocket"}>
        <summary onClick={(event) => {
          event.preventDefault();
          setOpenPanel((current) => current === "pocket" ? undefined : "pocket");
        }}>Pocket money</summary>
        {openPanel === "pocket" && <PocketMoney key={selected.id} project={selected.name}
          url={`${API_URL}/api/v1/projects/${selected.id}/pocket-money`} request={request} />}
      </details>
      </div>}
      </div>}
      </Fragment>
    </main>
  );
}

