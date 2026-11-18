import { FormEvent, useEffect, useState } from "react";
import MappedImport from "./MappedImport";
import { checked, json, RequestApi } from "./Ledger";

type Project = { id: string; name: string };
type Account = { id: string; accountCode: string };
type Supplier = { supplier: string; supplier_key: string; documents: number; project?: string; account_code?: string };
type Movement = { id: string; reference: string; booked_on: string; description: string; amount: number; document_id?: string; supplier?: string; invoice_number?: string };
export type InvoiceCandidate = { id: string; invoice_number: string | null; supplier: string | null; total: number | null; paid: number };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const cents = (value: number) => Math.round(value * 100);

export default function Reconciliation({ api, projects, request, invoices, refresh }: {
  api: string; projects: Project[]; request: RequestApi; invoices: InvoiceCandidate[]; refresh: () => Promise<void>;
}) {
  const base = `${api}/api/v1/ledger`;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bank, setBank] = useState<Movement[]>([]);
  const [project, setProject] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([request(`${base}/suppliers`), request(`${base}/bank`)])
      .then((responses) => Promise.all(responses.map(async (response) => (await checked(response)).json())))
      .then(([rules, movements]) => { if (active) { setSuppliers(rules); setBank(movements); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [base, request, invoices]);

  useEffect(() => {
    if (!project) return;
    let active = true;
    request(`${api}/api/v1/projects/${project}/financial-accounts`).then(checked)
      .then((response) => response.json()).then((items) => { if (active) setAccounts(items); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [api, project, request]);

  async function action(path: string, options: RequestInit, form?: HTMLFormElement) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await checked(await request(base + path, options));
      if (path === "/bank/import") {
        const result = await response.json();
        setMessage(`Importati ${result.imported} movimenti. Già presenti: ${result.skipped}.`);
      } else setMessage("Operazione completata.");
      form?.reset();
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function rule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action("/suppliers", json("PUT", { supplier: form.get("supplier"), projectId: project, accountId: form.get("accountId") }));
  }

  return <div className="module-form">
    {error && <p className="alert" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <fieldset className="module-fieldset" disabled={busy}>
      <article id="supplier-rules" className="card">
        <h2>Anagrafica fornitori</h2>
        <p>Associa un fornitore ricorrente al progetto e al conto abituali. La regola propone l’imputazione quando apri una fattura senza quote.</p>
        <form className="filter-bar" onSubmit={rule}>
          <label>Identificativo fornitore<input name="supplier" list="known-suppliers" placeholder="Es. IT + partita IVA" maxLength={250} required /></label>
          <datalist id="known-suppliers">{suppliers.map((item) => <option key={item.supplier_key} value={item.supplier} />)}</datalist>
          <label>Progetto<select required value={project} onChange={(event) => { setAccounts([]); setProject(event.target.value); }}>
            <option value="">Seleziona progetto</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Conto<select name="accountId" key={project} required disabled={!accounts.length}><option value="">Seleziona conto</option>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.accountCode}</option>)}</select></label>
          <button disabled={!accounts.length}>Salva regola</button>
        </form>
        {suppliers.map((item) => <div className="share-row" key={item.supplier_key}>
          <span>{item.supplier} · {item.documents} documenti {item.project && `· ${item.project} / ${item.account_code}`}</span>
          {item.project && <button className="secondary" onClick={() =>
            void action(`/suppliers?supplier=${encodeURIComponent(item.supplier)}`, { method: "DELETE" })}>Rimuovi regola</button>}
        </div>)}
      </article>
      <article className="card module-form">
        <h2>Riconciliazione bancaria</h2>
        <p>Importa le uscite bancarie. SaiControl evidenzia le fatture il cui saldo coincide con il movimento. Conferma il collegamento per aggiornare il pagato.</p>
        <MappedImport api={api} request={request} title="Estratto movimenti Excel o CSV"
          fields={["riferimento", "data", "descrizione", "importo"]} onImport={async (body) => {
            const result = await (await checked(await request(`${base}/bank/import`, { method: "POST", body }))).json();
            await refresh();
            return `Importati ${result.imported} movimenti · Già presenti ${result.skipped}`;
          }} />
        {bank.map((item) => {
          const candidates = invoices.filter((invoice) => invoice.total !== null && cents(invoice.total) - cents(invoice.paid) >= cents(item.amount));
          const exact = candidates.filter((invoice) => cents(invoice.total!) - cents(invoice.paid) === cents(item.amount));
          return <div key={item.id} className="pocket-record">
            <strong>{item.booked_on} · {money.format(item.amount)} · {item.reference}</strong>
            <p>{item.description}</p>
            {item.document_id ? <p>Riconciliato · {item.supplier || "Fornitore da completare"} · {item.invoice_number || "Numero assente"}</p> :
              <form className="filter-bar" onSubmit={(event) => {
                event.preventDefault();
                const documentId = new FormData(event.currentTarget).get("documentId");
                void action(`/bank/${item.id}/match`, json("POST", { documentId }));
              }}>
                <label>Fattura da abbinare<select name="documentId" required defaultValue={exact.length === 1 ? exact[0].id : ""}>
                  <option value="">{candidates.length ? "Seleziona una fattura" : "Nessuna fattura compatibile"}</option>
                  {candidates.map((invoice) => <option key={invoice.id} value={invoice.id}>
                    {exact.includes(invoice) ? "Saldo coincidente · " : ""}{invoice.supplier || "Fornitore da completare"} · {invoice.invoice_number || invoice.id.slice(0, 8)}
                  </option>)}
                </select></label><button disabled={!candidates.length}>Conferma abbinamento</button>
              </form>}
          </div>;
        })}
      </article>
    </fieldset>
  </div>;
}
