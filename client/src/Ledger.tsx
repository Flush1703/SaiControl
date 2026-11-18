import { FormEvent, useEffect, useMemo, useState } from "react";
import { budgetAfterShare, invoiceBalance, shareAmounts } from "./shareAmounts";
import ManualProjectLink from "./ManualProjectLink";
import InvoiceImport from "./InvoiceImport";
import Reconciliation from "./Reconciliation";
import { archive, type Filters } from "./ledgerArchive";
import MappedImport from "./MappedImport";

export type RequestApi = (url: string, options?: RequestInit) => Promise<Response>;
type Project = { id: string; name: string };
type Account = { id: string; accountCode: string; description: string; available: number };
const statuses = ["DA_RENDICONTARE", "IN_VERIFICA", "RENDICONTATO", "ESCLUSO"];
const payments = ["NON_SALDATO", "PARZIALMENTE_SALDATO", "SALDATO"];
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
type Share = { id: string; project_id: string; project: string; account_code: string; percentage: number; amount: number; reporting: string };
type Entry = {
  manual_project_id?: string | null;
  manual_project_name?: string | null;
  project_reference?: string | null;
  id: string; supplier: string | null; invoice_number: string | null; invoice_date: string | null;
  total: number | null; identity_hash: string | null; reviewed: boolean; paid: number;
  payment_date: string | null; reporting: string; payment_status: string;
  files: { hash: string; filename: string }[]; shares: Share[];
};

export function json(method: string, body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function checked(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.detail || problem?.message || (response.status === 413
      ? "Il caricamento supera il limite consentito." : `Operazione non riuscita (HTTP ${response.status}).`));
  }
  return response;
}

export async function download(response: Response, filename: string) {
  const url = URL.createObjectURL(await (await checked(response)).blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Options({ values }: { values: string[] }) {
  return <>{values.map((value) => <option key={value} value={value}>{label(value)}</option>)}</>;
}

function details(form: HTMLFormElement) {
  const values = new FormData(form);
  return {
    supplier: values.get("supplier") || null, invoiceNumber: values.get("invoiceNumber") || null,
    invoiceDate: values.get("invoiceDate") || null, total: values.get("total") || null,
    reviewed: values.get("reviewed") === "on",
  };
}

function DetailsFields({ entry }: { entry?: Entry }) {
  return <>
    <label>Identificativo fornitore<input name="supplier" placeholder="Es. partita IVA" maxLength={250} defaultValue={entry?.supplier ?? ""} /></label>
    <label>Numero documento<input name="invoiceNumber" maxLength={100} defaultValue={entry?.invoice_number ?? ""} /></label>
    <label>Data documento<input name="invoiceDate" type="date" defaultValue={entry?.invoice_date ?? ""} /></label>
    <label>Totale (€)<input name="total" type="number" min="0" step=".01" required defaultValue={entry?.total ?? ""} /></label>
  </>;
}

const defaultFilters: Filters = { search: "", project: "", payment: "", reporting: "", reviewOnly: false, order: "latest" };

export default function Ledger({ api, projects, request, refreshProjects }: { api: string; projects: Project[]; request: RequestApi; refreshProjects: () => Promise<void> }) {
  const base = `${api}/api/v1/ledger`;
  const [documents, setDocuments] = useState<Entry[]>([]);
  const [selected, setSelected] = useState("");
  const [project, setProject] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [suggestion, setSuggestion] = useState<{ supplier_key: string; project_id?: string; account_id?: string; project?: string; account_code?: string }>();
  const [shareStatus, setShareStatus] = useState("DA_RENDICONTARE");
  const [percentage, setPercentage] = useState("");
  const [accountId, setAccountId] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const results = useMemo(() => archive(documents, filters, projects), [documents, filters]);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(results.rows.length / 20));
  const currentPage = Math.min(page, pages);

  function filter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const entry = documents.find((item) => item.id === selected);
  const allocation = entry?.total == null ? null : shareAmounts(entry.total, entry.shares, percentage);
  const reviewCount = documents.filter((item) => !item.identity_hash && !item.reviewed).length;

  useEffect(() => {
    request(base).then(checked).then((response) => response.json()).then(setDocuments)
      .catch((cause: Error) => setError(cause.message));
  }, [base, request]);

  function openDocument(id: string) {
    if (id !== selected) {
      const document = documents.find((item) => item.id === id);
      setSelected(id);
      setPercentage("");
      setShareStatus("DA_RENDICONTARE");
      setProject(document?.manual_project_id ?? "");
      setAccounts([]);
      setAccountId("");
      setSuggestion(undefined);
    }
    requestAnimationFrame(() => window.document.getElementById("invoice-detail")?.scrollIntoView());
  }

  useEffect(() => {
    if (!project) return;
    let active = true;
    request(`${api}/api/v1/projects/${project}/planning`).then(checked)
      .then((response) => response.json()).then(({ budget }: {
        budget: { id: string; account_code: string; description: string; available: number }[];
      }) => {
        if (active) setAccounts(budget.map((item) => ({ ...item, accountCode: item.account_code })));
      })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [api, project, request, documents, selected]);

  useEffect(() => {
    if (!entry?.supplier || entry.shares.length) return;
    let active = true;
    const key = entry.supplier.trim().toLowerCase();
    request(`${base}/suppliers`).then(checked).then((response) => response.json())
      .then((rules: { supplier_key: string; project_id?: string }[]) => {
        if (active) setSuggestion(rules.find((rule) => rule.supplier_key === key && rule.project_id));
      }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [base, entry, request]);

  async function refresh() {
    setDocuments(await (await checked(await request(base))).json());
  }

  async function run(work: () => Promise<void>, reload = true) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      if (reload) await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, path: string, options: RequestInit, reset = false) {
    event.preventDefault();
    const form = event.currentTarget;
    void run(async () => {
      const response = await checked(await request(base + path, options));
      if (path === "") {
        setSelected(await response.json());
        setProject("");
        setAccounts([]);
        setAccountId("");
        setSuggestion(undefined);
      }
      if (reset) form.reset();
      if (path.endsWith("/shares")) { setPercentage(""); setShareStatus("DA_RENDICONTARE"); }
      setMessage("Dati salvati.");
    });
  }

  return <section className="ledger">
    <div className="module-heading"><h1>Documenti e rendicontazione</h1>
      <p>{documents.length} documenti · {reviewCount} da verificare per possibili duplicati</p></div>
    {error && <div className="alert" role="alert">{error}</div>}
    {message && <p role="status" className="notice">{message}</p>}
    <fieldset disabled={busy} className="module-fieldset">
      <div>
        <article className="card"><h2>Importa documenti</h2>
          <p>Carica fatture elettroniche XML o XML.P7M, oppure PDF e altri allegati. Verifica i documenti con dati incompleti.</p>
          <InvoiceImport base={base} request={request} projects={projects} refreshProjects={refreshProjects} updated={refresh} openDocument={openDocument} showUnassigned={() => {
            setFilters({ ...defaultFilters, project: "unassigned" });
            setPage(1);
            document.getElementById("invoice-archive")?.scrollIntoView({ block: "start" });
          }} />
          <MappedImport api={api} request={request} title="Elenco documenti XLSX, XLSM o CSV"
            fields={["fornitore", "numero", "data", "importo"]} onImport={async (body) => {
              const response = await checked(await request(`${base}/rows`, { method: "POST", body }));
              const result = await response.json();
              await refresh();
              return `Importati ${result.imported} · Duplicati ${result.skipped} · Da verificare ${result.review}`;
            }} />
        </article>
        <details className="card module-form"><summary>Registra documento manualmente</summary>
          <form className="module-form" onSubmit={(event) => submit(event, "", json("POST", details(event.currentTarget)), true)}>
            <DetailsFields /><button>Registra</button>
          </form>
        </details>
      </div>
      <article id="invoice-archive" className="card module-form">
        <h2>Archivio</h2>
        <div className="filter-bar">
          <label>Cerca per fornitore, numero, progetto o file<input type="search" value={filters.search} onChange={(event) => filter("search", event.target.value)} /></label>
          <label>Progetto<select value={filters.project} onChange={(event) => filter("project", event.target.value)}>
            <option value="">Tutti i progetti</option><option value="unassigned">Senza quote</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Pagamento<select value={filters.payment} onChange={(event) => filter("payment", event.target.value)}>
            <option value="">Tutti gli stati</option><Options values={payments} />
          </select></label>
          <label>Stato quota<select value={filters.reporting} disabled={filters.project === "unassigned"} onChange={(event) => filter("reporting", event.target.value)}>
            <option value="">Tutti gli stati</option><Options values={statuses} />
          </select></label>
          <label>Data fattura dal<input type="date" value={filters.from || ""} onChange={(event) => filter("from", event.target.value)} /></label>
          <label>Data fattura al<input type="date" value={filters.to || ""} onChange={(event) => filter("to", event.target.value)} /></label>
          <label>Formato<select value={filters.format || ""} onChange={(event) => filter("format", event.target.value as Filters["format"])}>
            <option value="">Tutti i formati</option><option value="xml">XML</option><option value="p7m">XML.P7M</option>
            <option value="pdf">PDF</option><option value="none">Senza allegato</option>
          </select></label>
          <label>Ordina per<select value={filters.order} onChange={(event) => filter("order", event.target.value as Filters["order"])}>
            <option value="latest">Data più recente</option><option value="oldest">Data meno recente</option>
            <option value="amount">Importo maggiore</option><option value="supplier">Fornitore A–Z</option><option value="project">Progetto in fattura A–Z</option>
          </select></label>
          <label className="checkbox"><input type="checkbox" checked={filters.reviewOnly} onChange={(event) => filter("reviewOnly", event.target.checked)} /> Solo documenti da verificare</label>
          <button type="button" className="secondary" onClick={() => { setFilters(defaultFilters); setPage(1); }}>Azzera filtri</button>
        </div>
        <p className="module-form" role="status">{results.rows.length} di {documents.length} documenti · {results.scoped ? "Totale quote filtrate" : "Totale documenti"} {euro.format(results.cents / 100)}</p>
        {!results.rows.length && <p>Nessun documento nei risultati.</p>}
        <div className="project-list">
          {results.rows.slice((currentPage - 1) * 20, currentPage * 20)
            .map(({ document: item, cents }) => <button key={item.id} type="button" className={item.id === selected ? "project active" : "project"} aria-pressed={item.id === selected}
              onClick={() => openDocument(item.id)}>
              <strong>{item.supplier || item.files[0]?.filename || "Documento senza fornitore"} {item.invoice_number && `· ${item.invoice_number}`}</strong>
              <span>{item.invoice_date || "Data assente"} · {label(item.payment_status)}{!item.identity_hash && !item.reviewed && " · Verifica duplicati"}</span>
              <span>{item.manual_project_name && `Progetto associato: ${item.manual_project_name} · `}{item.project_reference && `Riferimento in fattura: ${item.project_reference} · `}{[...new Set(item.shares.map((share) => share.project))].join(", ") || "Senza quote"}</span>
              <em>{cents === null ? "Importo assente" : euro.format(cents / 100)}</em>
            </button>)}
        </div>
        {pages > 1 && <nav className="filter-bar" aria-label="Paginazione documenti">
          <button type="button" className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Precedente</button>
          <span>Pagina {currentPage} di {pages}</span>
          <button type="button" className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Successiva</button>
        </nav>}
      </article>
      {entry && <article id="invoice-detail" className="card module-form" key={entry.id}>
        <h2>Dettaglio documento</h2>
        {(!entry.project_reference || !entry.manual_project_id) && <ManualProjectLink key={`${entry.id}:${entry.manual_project_id ?? ""}`}
          base={base} request={request} documentId={entry.id} current={entry.manual_project_id}
          projects={projects} updated={refresh} refreshProjects={refreshProjects} />}
        <p>{entry.files.length ? "Allegati originali" : "Documento registrato da dati tabellari o manuali"}</p>
        {entry.files.map((file) => <button key={file.hash} className="secondary" type="button" onClick={() =>
          void run(async () => download(await request(`${base}/files/${file.hash}`), file.filename), false)}>{file.filename}</button>)}
        <form className="filter-bar" onSubmit={(event) => submit(event, `/${entry.id}`, json("PUT", details(event.currentTarget)))}>
          <DetailsFields entry={entry} />
          {!entry.identity_hash && <label className="checkbox"><input type="checkbox" name="reviewed" defaultChecked={entry.reviewed} /> Verifica manuale duplicati completata</label>}
          <button>Salva dati</button>
        </form>
        <h3>Pagamento e rendicontazione</h3>
        <p>{label(entry.payment_status)} · Pagato {euro.format(entry.paid)}
          {entry.total !== null && ` · Da pagare ${euro.format(invoiceBalance(entry.total, entry.paid))}`}</p>
        <form key={`${entry.paid}:${entry.payment_date}:${entry.reporting}`} className="filter-bar" onSubmit={(event) => {
          const form = new FormData(event.currentTarget);
          submit(event, `/${entry.id}/payment`, json("PUT", {
            paid: form.get("paid"), date: form.get("date") || null, reporting: form.get("reporting"),
          }));
        }}>
          <label>Importo pagato (€)<input name="paid" type="number" min="0" max={entry.total ?? undefined} step=".01" required defaultValue={entry.paid} /></label>
          <label>Data pagamento<input name="date" type="date" defaultValue={entry.payment_date ?? ""} /></label>
          <label>Rendicontazione documento<select name="reporting" defaultValue={entry.reporting}><Options values={statuses} /></select></label>
          <button>Salva pagamento</button>
          {entry.total !== null && entry.paid < entry.total && <button type="button" className="secondary" onClick={(event) => {
            const field = event.currentTarget.form?.elements.namedItem("paid");
            if (field instanceof HTMLInputElement) field.value = String(entry.total);
            const date = event.currentTarget.form?.elements.namedItem("date");
            if (date instanceof HTMLInputElement) date.focus();
          }}>Imposta saldo totale</button>}
        </form>
        <h3>Imputazione al codice di spesa</h3>
        {suggestion && !entry.shares.length && <p className="notice">Regola fornitore: {suggestion.project} · {suggestion.account_code}{" "}
          <button type="button" className="secondary" onClick={() => {
            if (project !== suggestion.project_id) setAccounts([]);
            setProject(suggestion.project_id ?? "");
            setAccountId(suggestion.account_id ?? "");
          }}>Usa progetto e conto suggeriti</button>
        </p>}
        {allocation && <dl className="allocation-summary">
          <div><dt>Totale fattura</dt><dd>{euro.format(entry.total!)}</dd></div>
          <div><dt>Già ripartito</dt><dd>{euro.format(allocation.assigned / 100)}</dd></div>
          <div><dt>Da ripartire</dt><dd>{euro.format(allocation.remaining / 100)}</dd></div>
          <div><dt>Percentuale disponibile</dt><dd>{allocation.remainingPercent.toLocaleString("it-IT", { maximumFractionDigits: 4 })}%</dd></div>
        </dl>}
        {entry.shares.map((share) => <div className="share-row" key={share.id}>
          <span>{share.project} · {share.account_code} · {share.percentage}% · {euro.format(share.amount)}</span>
          <label>Rendicontazione quota<select value={share.reporting} onChange={(event) => {
            const status = event.target.value;
            void run(async () => { await checked(await request(`${base}/${entry.id}/shares/${share.id}`, json("PUT", { status }))); });
          }}><Options values={statuses} /></select></label>
          <button type="button" className="secondary" onClick={() => {
            if (window.confirm("Eliminare questa quota?")) void run(async () => {
              await checked(await request(`${base}/${entry.id}/shares/${share.id}`, { method: "DELETE" }));
            });
          }}>Elimina quota</button>
        </div>)}
        <form className="filter-bar" onSubmit={(event) => {
          const values = new FormData(event.currentTarget);
          submit(event, `/${entry.id}/shares`, json("POST", {
            projectId: project, accountId: values.get("account"), percentage: values.get("percentage"), reporting: values.get("reporting"),
          }), true);
        }}>
          <label>Progetto<select required value={project} onChange={(event) => { setAccounts([]); setAccountId(""); setProject(event.target.value); }}>
            <option value="">Seleziona progetto</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Codice di spesa<select name="account" required disabled={!accounts.length} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Seleziona conto</option>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.accountCode} · {item.description} · Residuo {euro.format(item.available)}</option>)}
          </select></label>
          <label>Percentuale<input name="percentage" type="number" min=".0001" max="100" step=".0001" required value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label>
          <label>Rendicontazione quota<select name="reporting" value={shareStatus} onChange={(event) => setShareStatus(event.target.value)}><Options values={statuses} /></select></label>
          <button disabled={!accounts.length || !allocation || allocation.exceeds}>Aggiungi quota</button>
          {allocation?.preview != null && <span role="status" className={allocation.exceeds ? "negative" : ""}>
            {allocation.exceeds ? "La quota supera l’importo o la percentuale disponibile." : `Importo della quota: ${euro.format(allocation.preview / 100)}`}
          </span>}
          {allocation?.preview != null && !allocation.exceeds && accounts.filter((item) => item.id === accountId).map((item) => {
            const after = budgetAfterShare(item.available, allocation.preview!, shareStatus);
            return <span key={item.id} role="status" className={after < 0 ? "negative" : ""}>
              Residuo del conto dopo l’imputazione: {euro.format(after)}{after < 0 && " · fuori budget"}
            </span>;
          })}
        </form>
      </article>}
      <article className="card module-form">
        <h2>Esporta quote e pagamenti</h2>
        <p>L’importo pagato si riferisce alla fattura intera e compare su ogni riga della stessa fattura.</p>
        <form className="filter-bar" onSubmit={(event) => {
          event.preventDefault();
          const filters = new URLSearchParams();
          new FormData(event.currentTarget).forEach((value, key) => { if (value) filters.set(key, String(value)); });
          void run(async () => download(await request(`${base}/export?${filters}`), "saicontrol-quote-pagamenti.csv"), false);
        }}>
          <label>Progetto<select name="projectId"><option value="">Tutti</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Stato pagamento<select name="payment"><option value="">Tutti</option><Options values={payments} /></select></label>
          <label>Rendicontazione quota<select name="reporting"><option value="">Tutti</option><Options values={statuses} /></select></label>
          <button>Scarica CSV</button>
        </form>
      </article>
    </fieldset>
    <Reconciliation api={api} projects={projects} request={request} invoices={documents} refresh={refresh} />
  </section>;
}
