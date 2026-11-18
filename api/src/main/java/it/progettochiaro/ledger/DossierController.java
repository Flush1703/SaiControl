package it.progettochiaro.ledger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/v1/projects/{project}/dossier")
public class DossierController {
  private final JdbcTemplate jdbc;

  public DossierController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  private static final String SHARES = """
      from ledger_shares s join financial_accounts a on a.id = s.account_id
      join ledger_documents d on d.id = s.document_id
      where a.project_id = ? and d.invoice_date between ? and ? and s.reporting <> 'ESCLUSO'
      """;

  @GetMapping
  public Map<String, Object> preview(@PathVariable UUID project, @RequestParam LocalDate from, @RequestParam LocalDate to) {
    validate(from, to);
    return jdbc.queryForMap("""
        select count(distinct d.id) as documents, count(*) as shares,
        count(distinct case when d.paid < d.total then d.id end) as unpaid,
        count(distinct case when not exists (select 1 from ledger_document_files f where f.document_id = d.id) then d.id end) as missing_files,
        count(case when s.reporting <> 'RENDICONTATO' then 1 end) as pending_shares,
        count(distinct case when a.allocated_budget < (select sum(x.amount) from ledger_shares x
          where x.account_id = a.id and x.reporting <> 'ESCLUSO') then a.id end) as over_budget
        """ + SHARES, project, from, to);
  }

  @GetMapping("/zip")
  public ResponseEntity<StreamingResponseBody> archive(@PathVariable UUID project, @RequestParam LocalDate from,
                                                         @RequestParam LocalDate to) {
    validate(from, to);
    String csv = CsvExport.query(jdbc, """
        select a.account_code, d.supplier, d.invoice_number, d.invoice_date, d.total,
               d.paid, d.payment_date, s.percentage, s.amount, s.reporting, d.id
        """ + SHARES + " order by d.invoice_date, d.id, a.account_code", new Object[]{project, from, to},
        "Conto;Fornitore;Numero;Data;Totale fattura;Pagato fattura;Data pagamento;Percentuale;Quota;Rendicontazione;ID fattura");
    var files = jdbc.queryForList("""
        select distinct f.hash, f.document_id, f.filename from ledger_document_files f
        where f.document_id in (select d.id
        """ + SHARES + ") order by f.document_id, f.hash", project, from, to);
    String movements = CsvExport.query(jdbc, """
        select m.document_id, m.reference, m.booked_on, m.description, m.amount from ledger_bank_movements m
        where m.document_id in (select d.id
        """ + SHARES + ") order by m.booked_on, m.reference", new Object[]{project, from, to},
        "ID fattura;Riferimento movimento;Data;Descrizione;Importo movimento");
    StreamingResponseBody body = output -> {
      try (var zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
        add(zip, "quote.csv", csv.getBytes(StandardCharsets.UTF_8));
        add(zip, "movimenti-riconciliati.csv", movements.getBytes(StandardCharsets.UTF_8));
        for (var file : files) {
          String encoded = jdbc.queryForObject("select contents from ledger_files where hash = ?", String.class, file.get("hash"));
          String name = file.get("filename").toString().replaceAll("[^\\p{L}\\p{N}._ -]", "_");
          add(zip, "fatture/" + file.get("document_id") + "/" + file.get("hash") + "-" + name,
              Base64.getDecoder().decode(encoded));
        }
      }
    };
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=saicontrol-fascicolo.zip").body(body);
  }

  private static void add(ZipOutputStream zip, String name, byte[] data) throws IOException {
    zip.putNextEntry(new ZipEntry(name));
    zip.write(data);
    zip.closeEntry();
  }

  private static void validate(LocalDate from, LocalDate to) {
    if (to.isBefore(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Intervallo non valido.");
  }
}
