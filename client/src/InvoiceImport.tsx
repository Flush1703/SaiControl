import { FormEvent, useState } from "react";
import { checked, type RequestApi } from "./Ledger";
import ManualProjectLink from "./ManualProjectLink";
import { invoiceSelection } from "./invoiceSelection";
import { importError } from "./importError";

type Result = { imported: number; skipped: number; review: number; assigned: number;
  results: { filename: string; path?: string; documentId?: string | null; projectAction?: string | null; supplier: string | null; number: string | null; date: string | null;
    total: number | null; projectReference: string | null; outcome: string; destination: string | null }[] };
const outcomes: Record<string, string> = {
  DUPLICATO_FILE: "File già presente", DUPLICATO_FATTURA: "Fattura già registrata",
  DATI_INCOMPLETI: "Dati da completare", SENZA_QUOTE: "Da ripartire", ASSEGNATA: "Regola fornitore",
  DESTINAZIONE_SUGGERITA: "Suggerita · assegnazione disattivata",
};
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default function InvoiceImport({ base, request, updated, showUnassigned, projects, refreshProjects }: {
  base: string; request: RequestApi; updated: () => Promise<void>; showUnassigned: () => void;
  projects: { id: string; name: string }[]; refreshProjects: () => Promise<void>;
}) {
  const [folder, setFolder] = useState(false);
  const [ignored, setIgnored] = useState(0);
  const [query, setQuery] = useState("");
  const [review, setReview] = useState<{ body: FormData; result: Result }>();
  const [completed, setCompleted] = useState<Result>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    setBusy(true);
    setError("");
    setReview(undefined);
    setCompleted(undefined);
    setQuery("");
    setIgnored(0);
    try {
      const { body, ignored } = invoiceSelection(Array.from(input.files ?? []), folder, false);
      setIgnored(ignored);
      const result = await (await checked(await request(`${base}/files/preview`, { method: "POST", body }))).json();
      setReview({ body, result });
    } catch (cause) { setError(importError(cause)); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!review) return;
    setBusy(true);
    setError("");
    try {
      const result = await (await checked(await request(`${base}/files`, { method: "POST", body: review.body }))).json();
      setReview(undefined);
      setCompleted(result);
      await Promise.all([updated(), refreshProjects()]);
    } catch (cause) { setError(importError(cause)); }
    finally { setBusy(false); }
  }

  const report = review?.result ?? completed;
  return <section className="module-form">
    <form onSubmit={inspect} onChange={() => { setReview(undefined); setCompleted(undefined); }}>
      <fieldset className="module-fieldset wizard-fields" disabled={busy}>
        <label>Origine<select value={folder ? "folder" : "files"} onChange={(event) => setFolder(event.target.value === "folder")}>
          <option value="files">File singoli o multipli</option><option value="folder">Cartella e sottocartelle</option>
        </select></label>
        <label>{folder ? "Seleziona cartella (XML, XML.P7M e PDF)" : "File XML, XML.P7M, PDF o altri allegati"}
          <input key={String(folder)} type="file" name="files" multiple required {...(folder ? { webkitdirectory: "" } : {})} />
        </label>
        <p>I progetti riconosciuti e mancanti verranno creati in bozza alla conferma.</p>
        <button>{busy ? "Elaborazione…" : "Mostra anteprima"}</button>
      </fieldset>
    </form>
    {error && <p className="alert" role="alert">{error}</p>}
    {report && <>
      {ignored > 0 && <p>{ignored} file di altri formati ignorati nella cartella.</p>}

      <h3>{review ? "Anteprima importazione" : "Esito importazione"}</h3>
      <p role="status">{report.imported} {review ? "da importare" : "importati"} · {report.skipped} duplicati · {report.review} con dati incompleti · {report.assigned} {review ? "da assegnare" : "assegnati"}</p>
      <label>Cerca nell’esito<input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Nome file, percorso, fornitore o progetto" /></label>
      <div className="table-wrap"><table><thead><tr>
        <th>File</th><th>Fornitore</th><th>Numero</th><th>Data</th><th>Totale</th><th>Esito</th><th>Progetto / conto</th><th>Progetto nel documento</th>
      </tr></thead><tbody>{report.results.filter((item) =>
        [item.path, item.filename, item.supplier, item.number, item.projectReference, item.destination]
          .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))
      ).map((item, index) => <tr key={index}>
        <td>{item.path || item.filename}</td><td>{item.supplier || "—"}</td><td>{item.number || "—"}</td>
        <td>{item.date || "—"}</td><td>{item.total == null ? "—" : euro.format(item.total)}</td>
        <td>{outcomes[item.outcome] ?? item.outcome}</td><td>{item.destination || "—"}</td>
        <td>{item.projectReference || "—"} {item.projectAction && <small> · {{
          DA_CREARE: "Da creare in bozza", CREATO: "Creato in bozza",
          ESISTENTE: "Progetto esistente", AMBIGUO: "Più progetti con questo nome",
        }[item.projectAction]}</small>}
          {completed && (!item.projectReference || item.projectAction === "AMBIGUO") && item.documentId && <ManualProjectLink
            key={item.documentId} base={base} request={request} documentId={item.documentId}
            projects={projects} updated={updated} refreshProjects={refreshProjects} />}
          {review && !item.projectReference && !item.outcome.startsWith("DUPLICATO") &&
            <small>Abbinabile dopo la conferma</small>}</td>
      </tr>)}</tbody></table></div>
      {review && <button type="button" disabled={busy || !report.imported} onClick={() => void confirm()}>Conferma importazione</button>}
      {completed && <button type="button" className="secondary" onClick={showUnassigned}>Vai ai documenti senza quote</button>}
    </>}
  </section>;
}
