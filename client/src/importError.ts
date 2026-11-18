export function importError(cause: unknown): string {
  if (cause instanceof TypeError) {
    return "Impossibile raggiungere il servizio di importazione. Se usi SaiControl in locale, avvia o riavvia l’API con ./run-local.sh e riprova.";
  }
  return cause instanceof Error ? cause.message : "Importazione non riuscita.";
}
