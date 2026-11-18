import { FormEvent, useState } from "react";
import { checked, json, type RequestApi } from "./Ledger";

export default function ManualProjectLink({ base, request, documentId, projects, current, updated, refreshProjects }: {
  base: string;
  request: RequestApi;
  documentId: string;
  projects: { id: string; name: string }[];
  current?: string | null;
  updated: () => Promise<void>;
  refreshProjects: () => Promise<void>;
}) {
  const [project, setProject] = useState(current ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    let projectId = project;
    try {
      if (projectId === "new") {
        const cleaned = name.trim();
        if (!cleaned) throw new Error("Inserisci il nome del progetto.");
        const existing = projects.find((item) => item.name.trim().toLowerCase() === cleaned.toLowerCase());
        if (existing) projectId = existing.id;
        else {
          const response = await checked(await request(base.replace(/\/ledger$/, "/projects"), json("POST", { name: cleaned })));
          projectId = (await response.json()).id;
          setProject(projectId);
          await refreshProjects();
        }
      }
      await checked(await request(`${base}/${documentId}/project`, json("PUT", { projectId: projectId || null })));
      await updated();
      setProject(projectId);
      setSaved(projectId ? "Progetto abbinato." : "Abbinamento rimosso.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  return <form className="module-form" onSubmit={save}>
    <label>Progetto associato<select value={project} disabled={busy} onChange={(event) => {
      setProject(event.target.value); setSaved(""); setError("");
    }}>
      <option value="">Nessun progetto associato</option>
      {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      <option value="new">Crea un progetto in bozza</option>
    </select></label>
    {project === "new" && <label>Nome del nuovo progetto<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required disabled={busy} /></label>}
    <button type="submit" className="secondary" disabled={busy || (!project && !current && !saved)}>
      {busy ? "Salvataggio…" : project === "new" ? "Crea e abbina" : "Salva abbinamento"}
    </button>
    {saved && <p role="status">{saved}</p>}
    {error && <p role="alert" className="alert">{error}</p>}
  </form>;
}
