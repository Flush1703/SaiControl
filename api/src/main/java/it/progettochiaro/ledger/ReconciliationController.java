package it.progettochiaro.ledger;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/ledger")
public class ReconciliationController {
  private final JdbcTemplate jdbc;

  public ReconciliationController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/suppliers")
  public List<Map<String, Object>> suppliers() {
    return jdbc.queryForList("""
        select k.supplier_key, coalesce(max(d.supplier), r.supplier) as supplier, count(d.supplier) as documents,
               r.account_id, a.project_id, p.name as project, a.account_code
        from (select lower(trim(supplier)) as supplier_key from ledger_documents
              where supplier is not null and trim(supplier) <> ''
              union select supplier_key from ledger_supplier_rules) k
        left join ledger_documents d on lower(trim(d.supplier)) = k.supplier_key
        left join ledger_supplier_rules r on r.supplier_key = k.supplier_key
        left join financial_accounts a on a.id = r.account_id
        left join projects p on p.id = a.project_id
        group by k.supplier_key, r.supplier, r.account_id, a.project_id, p.name, a.account_code
        order by supplier
        """);
  }

  @PutMapping("/suppliers")
  @Transactional
  public void rule(@Valid @RequestBody Rule rule) {
    String key = rule.supplier().strip().toLowerCase(Locale.ROOT);
    if (jdbc.queryForObject("select count(*) from financial_accounts where id = ? and project_id = ?",
        Integer.class, rule.accountId(), rule.projectId()) == 0) throw bad("Il conto non appartiene al progetto.");
    int updated = jdbc.update("update ledger_supplier_rules set account_id = ?, supplier = ? where supplier_key = ?",
        rule.accountId(), rule.supplier().strip(), key);
    if (updated == 0) jdbc.update("insert into ledger_supplier_rules values (?, ?, ?)", key, rule.supplier().strip(), rule.accountId());
  }

  @DeleteMapping("/suppliers")
  public void removeRule(@RequestParam String supplier) {
    jdbc.update("delete from ledger_supplier_rules where supplier_key = ?", supplier.strip().toLowerCase(Locale.ROOT));
  }

  @GetMapping("/bank")
  public List<Map<String, Object>> bank() {
    return jdbc.queryForList("""
        select m.*, d.invoice_number, d.supplier from ledger_bank_movements m
        left join ledger_documents d on d.id = m.document_id order by m.booked_on desc, m.reference
        """);
  }

  @PostMapping("/bank/import")
  @Transactional(rollbackFor = IOException.class)
  public Map<String, Integer> importBank(@RequestParam MultipartFile file, @RequestParam(required = false) List<Integer> columns) throws IOException {
    int imported = 0;
    int skipped = 0;
    int line = 1;
    for (var row : TableImport.read(file, List.of("riferimento", "data", "descrizione", "importo"), columns)) {
      line++;
      String reference = row.get(0).strip();
      String description = row.get(2).strip();
      LocalDate date;
      BigDecimal amount;
      try {
        date = LocalDate.parse(row.get(1).strip());
        amount = TableImport.amount(row.get(3)).abs().setScale(2);
        if (reference.isBlank() || reference.length() > 250 || description.length() > 500
            || amount.signum() == 0 || amount.precision() > 15) throw new IllegalArgumentException();
      } catch (RuntimeException exception) {
        throw bad("Verifica il movimento alla riga " + line + ".");
      }
      if (jdbc.queryForObject("select count(*) from ledger_bank_movements where reference = ?", Integer.class, reference) > 0) {
        skipped++;
        continue;
      }
      jdbc.update("insert into ledger_bank_movements (id, reference, booked_on, description, amount) values (?, ?, ?, ?, ?)",
          UUID.randomUUID(), reference, date, description, amount);
      imported++;
    }
    return Map.of("imported", imported, "skipped", skipped);
  }

  @PostMapping("/bank/{id}/match")
  @Transactional
  public void match(@PathVariable UUID id, @Valid @RequestBody Match match) {
    var movement = jdbc.queryForList("select * from ledger_bank_movements where id = ? for update", id)
        .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (movement.get("document_id") != null) throw bad("Movimento già riconciliato.");
    var invoice = jdbc.queryForList("select total, paid, payment_date from ledger_documents where id = ? for update",
        match.documentId()).stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    BigDecimal total = (BigDecimal) invoice.get("total");
    BigDecimal paid = ((BigDecimal) invoice.get("paid")).add((BigDecimal) movement.get("amount"));
    if (total == null || paid.compareTo(total) > 0) throw bad("Il movimento supera il residuo della fattura.");
    jdbc.update("""
        update ledger_documents set paid = ?, payment_date =
          case when payment_date > ? then payment_date else ? end where id = ?
        """, paid, movement.get("booked_on"), movement.get("booked_on"), match.documentId());
    jdbc.update("update ledger_bank_movements set document_id = ? where id = ?", match.documentId(), id);
  }

  private static ResponseStatusException bad(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  public record Rule(@NotBlank @Size(max = 250) String supplier, @NotNull UUID projectId, @NotNull UUID accountId) {}
  public record Match(@NotNull UUID documentId) {}
}
