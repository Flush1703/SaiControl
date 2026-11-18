package it.progettochiaro.ledger;

import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/ledger")
public class LedgerController {
  private final JdbcTemplate jdbc;

  private final Validator validator;
  private final it.progettochiaro.project.application.ProjectService projects;

  public LedgerController(JdbcTemplate jdbc, Validator validator,
                          it.progettochiaro.project.application.ProjectService projects) {
    this.projects = projects;
    this.validator = validator;
    this.jdbc = jdbc;
  }

  @GetMapping
  public List<Map<String, Object>> documents() {
    return jdbc.queryForList("""
        select d.*, p.name as manual_project_name, case when paid = 0 then 'NON_SALDATO'
          when paid = total then 'SALDATO' else 'PARZIALMENTE_SALDATO' end as payment_status
        from ledger_documents d left join projects p on p.id = d.manual_project_id order by d.invoice_date desc nulls last, d.id
        """).stream().map(document -> {
      Object id = document.get("id");
      document.put("files", jdbc.queryForList("select hash, filename from ledger_document_files where document_id = ?", id));
      document.put("shares", jdbc.queryForList("""
          select s.id, a.project_id, s.account_id, s.percentage, s.amount, s.reporting,
                 a.account_code, p.name as project
          from ledger_shares s join financial_accounts a on a.id = s.account_id
          join projects p on p.id = a.project_id where s.document_id = ? order by p.name, a.account_code
          """, id));
      return document;
    }).toList();
  }

  @PostMapping
  @Transactional
  public UUID register(@Valid @RequestBody Details details) {
    UUID id = UUID.randomUUID();
    insert(id, details);
    return id;
  }

  @PostMapping("/rows")
  @Transactional(rollbackFor = IOException.class)
  public ImportResult rows(@RequestParam MultipartFile file, @RequestParam(required = false) List<Integer> columns) throws IOException {
    int imported = 0;
    int skipped = 0;
    int review = 0;
    int rowNumber = 1;
    for (var row : TableImport.read(file, List.of("fornitore", "numero", "data", "importo"), columns)) {
      rowNumber++;
      Details details;
      try {
        details = new Details(row.get(0).strip(), row.get(1).strip(),
            row.get(2).isBlank() ? null : LocalDate.parse(row.get(2).strip()),
            row.get(3).isBlank() ? null : TableImport.amount(row.get(3)), false);
        if (!validator.validate(details).isEmpty()) throw new IllegalArgumentException();
      } catch (RuntimeException exception) {
        throw bad("Verifica i dati della riga " + rowNumber + ". Usa date AAAA-MM-GG.");
      }
      String identity = identity(details);
      if (identity != null && knownIdentity(identity)) {
        skipped++;
        continue;
      }
      insert(UUID.randomUUID(), details);
      imported++;
      if (identity == null) review++;
    }
    return new ImportResult(imported, skipped, review);
  }

  private boolean knownIdentity(String identity) {
    return jdbc.queryForObject("select count(*) from ledger_documents where identity_hash = ?", Integer.class, identity) > 0;
  }

  @PostMapping("/files")
  @Transactional(rollbackFor = IOException.class)
  public ImportResult upload(@RequestParam("files") List<MultipartFile> files,
                             @RequestParam(defaultValue = "false") boolean applyRules,
                             jakarta.servlet.http.HttpServletRequest request) throws IOException {
    return importFiles(files, applyRules, false, request.getParameterValues("paths"));
  }

  @PostMapping("/files/preview")
  public ImportResult preview(@RequestParam("files") List<MultipartFile> files,
                              @RequestParam(defaultValue = "false") boolean applyRules,
                             jakarta.servlet.http.HttpServletRequest request) throws IOException {
    return importFiles(files, applyRules, true, request.getParameterValues("paths"));
  }

  private ImportResult importFiles(List<MultipartFile> files, boolean applyRules, boolean preview, String[] paths) throws IOException {
    if (paths != null && paths.length != files.size()) throw bad("Percorsi della cartella non validi.");
    List<FileResult> results = new ArrayList<>();
    Set<String> hashes = new HashSet<>();
    Set<String> identities = new HashSet<>();
    int imported = 0;
    int skipped = 0;
    int review = 0;
    int assigned = 0;
    int unassigned = 0;
    for (int index = 0; index < files.size(); index++) {
      MultipartFile file = files.get(index);
      String filename = file.getOriginalFilename();
      if (file.isEmpty() || filename == null || filename.isBlank() || filename.length() > 255
          || filename.chars().anyMatch(Character::isISOControl)) throw bad("File non valido.");
      String path = paths == null ? filename : paths[index];
      if (path.isBlank() || path.length() > 4096 || path.chars().anyMatch(Character::isISOControl)) {
        throw bad("Percorso della cartella non valido.");
      }
      byte[] bytes = file.getBytes();
      String hash = sha(bytes);
      if (!hashes.add(hash) || jdbc.queryForObject("select count(*) from ledger_files where hash = ?", Integer.class, hash) > 0) {
        for (Details details : InvoiceXml.read(filename, bytes)) {
          results.add(FileResult.of(filename, path, details, "DUPLICATO_FILE", null));
        }
        skipped++;
        continue;
      }
      List<UUID> created = new ArrayList<>();
      for (Details details : InvoiceXml.read(filename, bytes)) {
        String identity = identity(details);
        if (identity != null && (!identities.add(identity) || knownIdentity(identity))) {
          results.add(FileResult.of(filename, path, details, "DUPLICATO_FATTURA", null));
          skipped++;
          continue;
        }
        UUID id = UUID.randomUUID();
        if (!preview) {
          insert(id, details);
          created.add(id);
        }
        imported++;
        if (identity == null) review++;
        String outcome = identity == null ? "DATI_INCOMPLETI" : "SENZA_QUOTE";
        String destination = null;
        UUID projectId = null;
        String projectAction = null;
        if (details.projectReference() != null) {
          var matching = jdbc.queryForList(
              "select id from projects where lower(trim(name)) = lower(?)", UUID.class, details.projectReference());
          if (matching.size() > 1) {
            projectAction = "AMBIGUO";
          } else if (matching.isEmpty()) {
            projectAction = preview ? "DA_CREARE" : "CREATO";
            if (!preview) projectId = projects.create(details.projectReference(), null, null, null, null).getId();
          } else {
            projectAction = "ESISTENTE";
            projectId = matching.getFirst();
          }
          if (!preview && projectId != null) {
            jdbc.update("update ledger_documents set manual_project_id = ? where id = ?", projectId, id);
          }
        }
        if (InvoiceXml.supported(filename)) {
          if (applyRules && !"AMBIGUO".equals(projectAction) && identity != null && details.total().signum() > 0) {
            var rules = jdbc.queryForList("""
                select p.name, a.account_code, a.id from ledger_supplier_rules r
                join financial_accounts a on a.id = r.account_id
                join projects p on p.id = a.project_id where r.supplier_key = ?
                  and (? = '' or lower(trim(p.name)) = lower(?))
                """, details.supplier().strip().toLowerCase(Locale.ROOT),
                Objects.toString(details.projectReference(), ""), Objects.toString(details.projectReference(), ""));
            if (!rules.isEmpty()) {
              var rule = rules.getFirst();
              if (!preview) jdbc.update("""
                  insert into ledger_shares (id, document_id, account_id, percentage, amount, reporting)
                  values (?, ?, ?, 100, ?, 'DA_RENDICONTARE')
                  """, UUID.randomUUID(), id, rule.get("id"), details.total());
              destination = rule.get("name") + " / " + rule.get("account_code");
              outcome = applyRules ? "ASSEGNATA" : "DESTINAZIONE_SUGGERITA";
            }
          }
          if ("ASSEGNATA".equals(outcome)) assigned++;
          else unassigned++;
        }
        results.add(FileResult.of(filename, path, details, outcome, destination, preview ? null : id, projectAction));
      }
      if (!created.isEmpty()) {
        try {
          jdbc.update("insert into ledger_files values (?, ?, ?, ?)", hash, created.getFirst(), filename,
              Base64.getEncoder().encodeToString(bytes));
          for (UUID id : created.subList(1, created.size())) {
            jdbc.update("insert into ledger_file_links values (?, ?)", hash, id);
          }
        } catch (DuplicateKeyException exception) {
          throw new ResponseStatusException(HttpStatus.CONFLICT, "Importazione concorrente. Riprova.");
        }
      }
    }
    return new ImportResult(imported, skipped, review, assigned, unassigned, results);
  }

  public record FileResult(String filename, String path, String supplier, String number, LocalDate date, BigDecimal total,
                           String outcome, String destination, String projectReference, UUID documentId, String projectAction) {
    static FileResult of(String filename, String path, Details details, String outcome, String destination) {
      return of(filename, path, details, outcome, destination, null, null);
    }

    static FileResult of(String filename, String path, Details details, String outcome, String destination, UUID id, String projectAction) {
      return new FileResult(filename, path, details.supplier(), details.invoiceNumber(), details.invoiceDate(),
          details.total(), outcome, destination, details.projectReference(), id, projectAction);
    }
  }

  @GetMapping("/files/{hash}")
  public ResponseEntity<byte[]> download(@PathVariable String hash) {
    return jdbc.query("select filename, contents from ledger_files where hash = ?", (row, index) ->
        ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                .filename(row.getString("filename"), StandardCharsets.UTF_8).build().toString())
            .body(Base64.getDecoder().decode(row.getString("contents"))), hash)
        .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  @PutMapping("/{id}/project")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void linkProject(@PathVariable UUID id, @RequestBody ProjectLink link) {
    if (link.projectId() != null && jdbc.queryForObject(
        "select count(*) from projects where id = ?", Integer.class, link.projectId()) == 0) {
      throw bad("Il progetto selezionato non esiste.");
    }
    if (jdbc.update("update ledger_documents set manual_project_id = ? where id = ?", link.projectId(), id) == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
  }

  public record ProjectLink(UUID projectId) {}

  @PutMapping("/{id}")
  @Transactional
  public void details(@PathVariable UUID id, @Valid @RequestBody Details details) {
    Map<String, Object> current = lock(id);
    BigDecimal minimum = ((BigDecimal) current.get("paid")).max(shareTotal(id, "amount"));
    if (details.total() == null || details.total().compareTo(minimum) < 0) {
      throw bad("Il totale deve coprire pagamenti e quote registrati.");
    }
    if (shareTotal(id, "percentage").signum() > 0
        && details.total().compareTo((BigDecimal) current.get("total")) != 0) {
      throw bad("Elimina le quote prima di cambiare il totale.");
    }
    try {
      jdbc.update("""
          update ledger_documents set supplier = ?, invoice_number = ?, invoice_date = ?, total = ?,
              identity_hash = ?, reviewed = ? where id = ?
          """, details.supplier(), details.invoiceNumber(), details.invoiceDate(), details.total(),
          identity(details), details.reviewed(), id);
    } catch (DuplicateKeyException exception) {
      throw duplicate();
    }
  }

  @PutMapping("/{id}/payment")
  @Transactional
  public void payment(@PathVariable UUID id, @Valid @RequestBody Payment payment) {
    BigDecimal total = (BigDecimal) lock(id).get("total");
    BigDecimal reconciled = jdbc.queryForObject(
        "select coalesce(sum(amount), 0) from ledger_bank_movements where document_id = ?", BigDecimal.class, id);
    if (payment.paid().compareTo(reconciled) < 0) throw bad("Il pagato deve coprire i movimenti riconciliati.");
    if (payment.paid().signum() > 0 &&
        (total == null || payment.paid().compareTo(total) > 0 || payment.date() == null)) {
      throw bad("Indica la data e un pagamento entro il totale del documento.");
    }
    jdbc.update("update ledger_documents set paid = ?, payment_date = ?, reporting = ? where id = ?",
        payment.paid(), payment.paid().signum() == 0 ? null : payment.date(), payment.reporting().name(), id);
  }

  @PostMapping("/{id}/shares")
  @Transactional
  public UUID share(@PathVariable UUID id, @Valid @RequestBody Share share) {
    BigDecimal total = (BigDecimal) lock(id).get("total");
    if (total == null) throw bad("Inserisci prima il totale del documento.");
    BigDecimal amount = total.multiply(share.percentage()).movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
    if (shareTotal(id, "percentage").add(share.percentage()).compareTo(BigDecimal.valueOf(100)) > 0
        || shareTotal(id, "amount").add(amount).compareTo(total) > 0) {
      throw bad("Le quote superano il totale o il 100% della fattura.");
    }
    UUID shareId = UUID.randomUUID();
    int count = jdbc.update("""
        insert into ledger_shares (id, document_id, account_id, percentage, amount, reporting)
        select ?, ?, a.id, ?, ?, ? from financial_accounts a where a.id = ? and a.project_id = ?
        """, shareId, id, share.percentage(), amount, share.reporting().name(), share.accountId(), share.projectId());
    if (count == 0) throw bad("Il conto non appartiene al progetto selezionato.");
    return shareId;
  }

  @PutMapping("/{id}/shares/{shareId}")
  public void reporting(@PathVariable UUID id, @PathVariable UUID shareId, @Valid @RequestBody Reporting reporting) {
    requireShare(jdbc.update("update ledger_shares set reporting = ? where document_id = ? and id = ?",
        reporting.status().name(), id, shareId));
  }

  @DeleteMapping("/{id}/shares/{shareId}")
  @Transactional
  public void remove(@PathVariable UUID id, @PathVariable UUID shareId) {
    lock(id);
    requireShare(jdbc.update("delete from ledger_shares where document_id = ? and id = ?", id, shareId));
  }

  @GetMapping(value = "/export", produces = "text/csv;charset=UTF-8")
  public String export(@RequestParam(required = false) UUID projectId,
                       @RequestParam(required = false) PaymentStatus payment,
                       @RequestParam(required = false) Status reporting) {
    StringBuilder sql = new StringBuilder("""
        select p.name, a.account_code, d.supplier, d.invoice_number, d.invoice_date, d.total,
               s.percentage, s.amount, d.paid, d.payment_date,
               case when d.paid = 0 then 'NON_SALDATO' when d.paid = d.total then 'SALDATO'
                    else 'PARZIALMENTE_SALDATO' end,
               d.reporting, s.reporting, d.id
        from ledger_shares s join ledger_documents d on d.id = s.document_id
        join financial_accounts a on a.id = s.account_id join projects p on p.id = a.project_id
        where 1=1
        """);
    List<Object> args = new ArrayList<>();
    if (projectId != null) { sql.append(" and p.id = ?"); args.add(projectId); }
    if (reporting != null) { sql.append(" and s.reporting = ?"); args.add(reporting.name()); }
    if (payment != null) sql.append(switch (payment) {
      case NON_SALDATO -> " and d.paid = 0";
      case PARZIALMENTE_SALDATO -> " and d.paid > 0 and d.paid < d.total";
      case SALDATO -> " and d.paid > 0 and d.paid = d.total";
    });
    sql.append(" order by p.name, a.account_code, d.invoice_date, s.id");
    return CsvExport.query(jdbc, sql.toString(), args.toArray(),
        "Progetto;Conto;Fornitore;Numero;Data;Totale fattura;Percentuale;Importo quota;Pagato fattura;Data pagamento;Stato pagamento;Rendicontazione documento;Rendicontazione quota;ID fattura");
  }

  private Map<String, Object> lock(UUID id) {
    return jdbc.queryForList("select total, paid from ledger_documents where id = ? for update", id)
        .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  private BigDecimal shareTotal(UUID id, String column) {
    return jdbc.queryForObject("select coalesce(sum(" + column + "), 0) from ledger_shares where document_id = ?",
        BigDecimal.class, id);
  }

  private void insert(UUID id, Details details) {
    try {
      jdbc.update("""
          insert into ledger_documents (id, supplier, invoice_number, invoice_date, total, identity_hash, reviewed, project_reference)
          values (?, ?, ?, ?, ?, ?, ?, ?)
          """, id, details.supplier(), details.invoiceNumber(), details.invoiceDate(), details.total(),
          identity(details), details.reviewed(), details.projectReference());
    } catch (DuplicateKeyException exception) {
      throw duplicate();
    }
  }

  private static String identity(Details details) {
    if (details.supplier() == null || details.supplier().isBlank() || details.invoiceNumber() == null
        || details.invoiceNumber().isBlank() || details.invoiceDate() == null || details.total() == null) return null;
    String supplier = details.supplier().strip().toUpperCase(Locale.ROOT);
    String number = details.invoiceNumber().strip().toUpperCase(Locale.ROOT);
    return sha((supplier.length() + ":" + supplier + number.length() + ":" + number + details.invoiceDate()
        + ":" + details.total().setScale(2)).getBytes(StandardCharsets.UTF_8));
  }

  private static String sha(byte[] contents) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(contents));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  private static void requireShare(int updated) {
    if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
  }

  private static ResponseStatusException duplicate() {
    return new ResponseStatusException(HttpStatus.CONFLICT, "Documento già registrato.");
  }

  private static ResponseStatusException bad(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  public enum Status { DA_RENDICONTARE, IN_VERIFICA, RENDICONTATO, ESCLUSO }
  public enum PaymentStatus { NON_SALDATO, PARZIALMENTE_SALDATO, SALDATO }
  public record Details(@Size(max = 250) String supplier, @Size(max = 100) String invoiceNumber,
                        LocalDate invoiceDate, @DecimalMin("0") @Digits(integer = 13, fraction = 2) BigDecimal total,
                        boolean reviewed, @Size(max = 200) String projectReference) {
    @com.fasterxml.jackson.annotation.JsonCreator
    public Details {}

    Details(String supplier, String invoiceNumber, LocalDate invoiceDate, BigDecimal total, boolean reviewed) {
      this(supplier, invoiceNumber, invoiceDate, total, reviewed, null);
    }
  }
  public record Payment(@NotNull @DecimalMin("0") @Digits(integer = 13, fraction = 2) BigDecimal paid,
                        LocalDate date, @NotNull Status reporting) {}
  public record Share(@NotNull UUID projectId, @NotNull UUID accountId,
                      @NotNull @DecimalMin("0.0001") @DecimalMax("100")
                      @Digits(integer = 3, fraction = 4) BigDecimal percentage, @NotNull Status reporting) {}
  public record Reporting(@NotNull Status status) {}
  public record ImportResult(int imported, int skipped, int review, int assigned, int unassigned, List<FileResult> results) {
    ImportResult(int imported, int skipped, int review) { this(imported, skipped, review, 0, 0, List.of()); }
  }
}
