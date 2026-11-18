export function invoiceSelection(files: File[], folder: boolean, applyRules: boolean) {
  const selected = folder ? files.filter((file) => /\.(?:xml(?:\.p7m)?|pdf)$/i.test(file.name)) : files;
  if (!selected.length) throw new Error("Seleziona almeno un file. Nelle cartelle vengono cercati XML, XML.P7M e PDF.");
  if (selected.some((file) => file.size > 20 * 1024 ** 2)) throw new Error("Un file supera il limite di 20 MB.");
  if (selected.reduce((total, file) => total + file.size, 0) >= 100 * 1024 ** 2) {
    throw new Error("La selezione supera il limite di 100 MB. Importa una sottocartella alla volta.");
  }
  const body = new FormData();
  for (const file of selected) {
    body.append("files", file);
    if (folder) body.append("paths", file.webkitRelativePath || file.name);
  }
  if (applyRules) body.set("applyRules", "true");
  return { body, ignored: files.length - selected.length };
}
