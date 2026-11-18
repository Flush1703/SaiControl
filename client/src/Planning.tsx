import { FormEvent, useEffect, useState } from "react";
import { checked, download, json, RequestApi } from "./Ledger";

type Budget = { id: string; account_code: string; description: string; allocated_budget: number; allocated: number; reported: number; available: number; paid: number; unpaid: number };
type Revision = { id: string; source: string; target: string; amount: number; reason: string; approved_at: string | null; approval_reference: string | null; source_after: number; target_after: number };
type Staff = { id: string; account_code: string; role_name: string; month_start: string; hours: number; hourly_cost: number; estimate: number };
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default function Planning({ base, request, changed }: { base: string; request: RequestApi; changed: () => void }) {
  const [data, setData] = useState<{ budget: Budget[]; revisions: Revision[]; staff: Staff[] }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request(base).then(checked).then((response) => response.json())
      .then((result) => { if (active) setData(result); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [base, request]);

  async function action(path: string, options: RequestInit, form?: HTMLFormElement) {
    setError("");
    setBusy(true);
    try {
      await checked(await request(base + path, options));
      if (options.method === "DELETE") {
        const id = path.split("/").at(-1);
        setData((current) => current && (path.startsWith("/revisions/")
          ? { ...current, revisions: current.revisions.filter((item) => item.id !== id) }
          : { ...current, staff: current.staff.filter((item) => item.id !== id) }));
        return;
      }
      setData(await (await checked(await request(base))).json());
      form?.reset();
      if (path.endsWith("/approve")) changed();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void action(path, json("POST", { ...values, attested: values.attested === "on" }), form);
  }

  function csv(type: string) {
    request(`${base}/export?type=${type}`).then((response) => download(response, `saicontrol-${type}.csv`))
      .catch((cause: Error) => setError(cause.message));
  }

  const options = <><option value="">Seleziona conto</option>{data?.budget.map((account) =>
    <option key={account.id} value={account.id}>{account.account_code} · {account.description}</option>)}</>;

  const total = (key: "allocated_budget" | "allocated" | "paid" | "unpaid" | "available") =>
    eur.format((data?.budget.reduce((sum, account) => sum + Math.round(account[key] * 100), 0) ?? 0) / 100);

  return <section className="card plan planning" id="situazione-contabile">
    <h2>Monitoraggio budget e pianificazione</h2>
    {error && <div className="alert" role="alert">{error}</div>}
    {!data && !error && <p>Caricamento…</p>}
    {data && <fieldset className="module-fieldset" disabled={busy}>
      <h3>Situazione contabile per progetto</h3>
      <dl className="allocation-summary">
        <div><dt>Budget</dt><dd>{total("allocated_budget")}</dd></div>
        <div><dt>Spese imputate</dt><dd>{total("allocated")}</dd></div>
        <div><dt>Pagato sulle quote</dt><dd>{total("paid")}</dd></div>
        <div><dt>Da pagare sulle quote</dt><dd>{total("unpaid")}</dd></div>
        <div><dt>Budget residuo</dt><dd>{total("available")}</dd></div>
      </dl>
      <p>Il pagato di una fattura viene ripartito sulle quote in proporzione agli importi imputati. Anche i movimenti bancari riconciliati aggiornano il pagato.</p>
      <p>Il residuo sottrae dal budget le quote imputate, escluse quelle con stato Escluso.</p>
      <div className="table-wrap"><table><thead><tr><th>Conto</th><th>Budget</th><th>Imputato</th><th>Rendicontato</th><th>Pagato</th><th>Da pagare</th><th>Budget residuo</th></tr></thead>
        <tbody>{data.budget.map((item) => <tr key={item.id}><th>{item.account_code} · {item.description}</th>
          <td>{eur.format(item.allocated_budget)}</td><td>{eur.format(item.allocated)}</td><td>{eur.format(item.reported)}</td>
          <td>{eur.format(item.paid)}</td><td>{eur.format(item.unpaid)}</td>
          <td className={item.available < 0 ? "negative" : ""}>{eur.format(item.available)}</td></tr>)}</tbody></table></div>
      <button className="secondary" onClick={() => csv("budget")}>CSV situazione contabile</button>
      <h3>Rimodulazioni</h3>
      <form className="filter-bar" onSubmit={(event) => submit(event, "/revisions")}>
        <label>Da conto<select name="sourceId" required>{options}</select></label>
        <label>A conto<select name="targetId" required>{options}</select></label>
        <label>Importo (€)<input type="number" name="amount" min=".01" step=".01" required /></label>
        <label>Motivazione<input name="reason" maxLength={500} required /></label>
        <button>Simula</button>
      </form>
      {data.revisions.map((revision) => <article key={revision.id} className="pocket-record">
        <strong>{revision.source} → {revision.target} · {eur.format(revision.amount)}</strong>
        <p>{revision.reason}</p>
        {revision.approved_at ? <p>Applicata · Atto {revision.approval_reference} · {revision.approved_at}</p> : <>
          <button type="button" className="secondary" onClick={() => {
            if (window.confirm("Eliminare la simulazione?")) {
              void action(`/revisions/${revision.id}`, { method: "DELETE" });
            }
          }}>Elimina simulazione</button>
          <p>Budget simulato: {revision.source} {eur.format(revision.source_after)} · {revision.target} {eur.format(revision.target_after)}</p>
          <form className="filter-bar" onSubmit={(event) => submit(event, `/revisions/${revision.id}/approve`)}>
            <label>Protocollo o riferimento dell’atto<input name="reference" required maxLength={250} /></label>
            <label className="checkbox"><input type="checkbox" name="attested" required /> Attesto che la rimodulazione è stata formalmente approvata</label>
            <button>Applica al budget</button>
          </form>
        </>}
      </article>)}
      <button className="secondary module-form" onClick={() => csv("revisions")}>CSV rimodulazioni</button>
      <h3>Stime mensili del personale</h3>
      <form className="filter-bar" onSubmit={(event) => submit(event, "/staff")}>
        <label>Conto<select name="accountId" required>{options}</select></label>
        <label>Ruolo<input name="roleName" maxLength={200} required /></label>
        <label>Mese<input type="month" name="month" required /></label>
        <label>Ore<input name="hours" type="number" min=".01" step=".01" required /></label>
        <label>Costo orario (€)<input name="hourlyCost" type="number" min="0" step=".01" required /></label>
        <button>Salva stima</button>
      </form>
      {data.staff.map((item) => <div key={item.id} className="share-row">
        <span>{item.month_start.slice(0, 7)} · {item.account_code} · {item.role_name} · {item.hours} h × {eur.format(item.hourly_cost)} · <strong>{eur.format(item.estimate)}</strong></span>
        <button className="secondary" onClick={() => {
          if (window.confirm("Eliminare la stima?")) void action(`/staff/${item.id}`, { method: "DELETE" });
        }}>Elimina</button>
      </div>)}
      <button className="secondary module-form" onClick={() => csv("staff")}>CSV costi del personale</button>
    </fieldset>}
  </section>;
}
