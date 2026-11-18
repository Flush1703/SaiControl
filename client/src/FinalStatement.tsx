import { finalStatement, type StatementAccount, type StatementRow } from "./statementTotals";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default function FinalStatement({ accounts, project, year }: {
  accounts: StatementAccount[];
  project: { name: string; reference_code?: string | null };
  year: string;
}) {
  const report = finalStatement(accounts);
  function line(item: StatementRow, key: string) {
    return <tr key={key} className={item.subtotal ? "statement-subtotal" : ""}>
      <th scope="row">{item.code}</th>
      <td style={{ paddingLeft: `${12 + item.level * 16}px` }}>{item.description}</td>
      <td>{euro.format(item.cents / 100)}</td>
    </tr>;
  }

  return <section className="statement module-form">
    <div className="card-title">
      <div><h3>Prospetto finale · {project.name}</h3>
        <p>{project.reference_code && `${project.reference_code} · `}Annualità {year} · 01/01/{year} – 31/12/{year}</p></div>
      <button type="button" className="secondary statement-print" onClick={() => window.print()}>Stampa o salva PDF</button>
    </div>
    <p>Bozza di lavoro · schema ORD · importi delle quote con stato Rendicontato, per data fattura.</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Codice</th><th>Descrizione spesa</th><th>Importo rendicontato</th></tr></thead>
      <tbody>
        {report.rows.map((item, index) => line(item, `row-${index}`))}
        <tr className="statement-subtotal"><th colSpan={2}>Totale costi diretti classificati</th><td>{euro.format(report.direct / 100)}</td></tr>
        {line(report.indirect, "indirect")}
        {report.other.length > 0 && <>
          <tr className="statement-subtotal"><th colSpan={2}>Conti fuori schema ORD · da classificare</th><td>{euro.format(report.otherTotal / 100)}</td></tr>
          {report.other.map((item, index) => line(item, `other-${index}`))}
        </>}
      </tbody>
      <tfoot><tr className="statement-subtotal"><th colSpan={2}>Totale complessivo</th><td>{euro.format(report.total / 100)}</td></tr></tfoot>
    </table></div>
  </section>;
}
