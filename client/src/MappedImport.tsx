import { FormEvent, useState } from "react";
import { checked, RequestApi } from "./Ledger";

type Preview = { headers: string[]; count: number; sample: string[][] };

export default function MappedImport({ api, request, fields, title, onImport }: {
  api: string; request: RequestApi; fields: string[]; title: string;
  onImport: (body: FormData) => Promise<string>;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [mapping, setMapping] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `saicontrol-import:${fields.join(",")}`;
  const valid = mapping.length === fields.length && mapping.every(Boolean) && new Set(mapping).size === fields.length;

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await checked(await request(`${api}/api/v1/import-preview`, { method: "POST", body }));
      const data: Preview = await response.json();
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, string>;
      setMapping(fields.map((field) => {
        const index = data.headers.findIndex((header) => header.trim().toLowerCase() === (saved[field] || field));
        return index < 0 ? "" : String(index);
      }));
      setFile(body.get("file") as File);
      setPreview(data);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !preview || !valid) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("columns", mapping.join(","));
      setMessage(await onImport(body));
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(fields.map(
        (field, index) => [field, preview.headers[Number(mapping[index])].trim().toLowerCase()]
      ))));
      setPreview(undefined);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="module-form">
    <form className="filter-bar" onSubmit={inspect}>
      <label>{title}<input type="file" name="file" accept=".xlsx,.xlsm,.csv" required
        onChange={() => { setPreview(undefined); setMessage(""); }} /></label>
      <button disabled={busy} className="secondary">Mostra anteprima</button>
    </form>
    {error && <p className="alert" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {preview && <form onSubmit={confirm} className="module-form">
      <div className="filter-bar">{fields.map((field, index) => <label key={field}>{field}
        <select required value={mapping[index]} onChange={(event) => {
          const value = event.target.value;
          setMapping((current) => current.map((item, i) => i === index ? value : item));
        }}>
          <option value="">Scegli colonna</option>
          {preview.headers.map((header, column) => <option key={column} value={column}>{column + 1} · {header || "Senza nome"}</option>)}
        </select></label>)}</div>
      <small>{preview.count} righe nel file. Anteprima delle prime {preview.sample.length}.</small>
      <div className="table-wrap"><table><thead><tr>{fields.map((field) => <th key={field}>{field}</th>)}</tr></thead>
        <tbody>{preview.sample.map((row, index) => <tr key={index}>{mapping.map((column, i) =>
          <td key={i}>{column === "" ? "—" : row[Number(column)] || "—"}</td>)}</tr>)}</tbody>
      </table></div>
      <button disabled={busy || !valid}>Conferma importazione</button>
    </form>}
  </div>;
}
