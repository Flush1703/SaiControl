package it.progettochiaro.ledger;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/projects/{project}/annual-report/{year}")
public class AnnualReportingController {
  private final JdbcTemplate jdbc;

  public AnnualReportingController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private static final String REGISTER = """
      select a.account_code, d.supplier, d.invoice_number, d.invoice_date, s.amount as share_amount,
             d.total as invoice_total, d.paid as invoice_paid, d.payment_date, s.reporting,
             d.id as document_id, s.id as share_id
      from ledger_shares s join financial_accounts a on a.id = s.account_id
      join ledger_documents d on d.id = s.document_id
      where a.project_id = ? and d.invoice_date between ? and ? and s.reporting <> 'ESCLUSO'
      """;
  private static final String ORDER = " order by invoice_date, document_id, share_id";
  private static final String HEADER =
      "Conto;Fornitore;Numero fattura;Data fattura;Importo imputato;Totale fattura;Pagato fattura;Ultima data pagamento;Stato quota;ID fattura;ID quota";

  @GetMapping
  public Map<String, Object> preview(@PathVariable UUID project, @PathVariable int year) {
    validate(project, year);
    var rows = jdbc.queryForMap("""
        select count(*) as shares, coalesce(sum(r.share_amount), 0) as allocated,
          count(distinct case when r.invoice_paid < r.invoice_total then r.document_id end) as not_settled,
          count(case when r.reporting <> 'RENDICONTATO' then 1 end) as pending
        from (
        """ + REGISTER + ") r", project, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
    var firstSemester = jdbc.queryForList("""
        select distinct d.id, d.invoice_number, d.invoice_date, d.payment_date
        from ledger_documents d join ledger_shares s on s.document_id = d.id
        join financial_accounts a on a.id = s.account_id
        where a.project_id = ? and s.reporting <> 'ESCLUSO'
            and d.invoice_date < ? and d.payment_date between ? and ?
        order by d.payment_date, d.id
        """, project, LocalDate.of(year, 1, 1), LocalDate.of(year, 1, 1), LocalDate.of(year, 6, 30));
    return Map.of("summary", rows, "previousYearCandidates", firstSemester,
        "ordinaryDeadline", LocalDate.of(year + 1, 5, 31));
  }

  @GetMapping(value = "/csv", produces = "text/csv;charset=UTF-8")
  public String export(@PathVariable UUID project, @PathVariable int year, @RequestParam String type) {
    validate(project, year);
    var start = LocalDate.of(year, 1, 1);
    var end = LocalDate.of(year, 12, 31);
    return switch (type) {
      case "register" -> CsvExport.query(jdbc, REGISTER + ORDER, new Object[]{project, start, end}, HEADER);
      case "unsettled" -> CsvExport.query(jdbc,
          REGISTER + " and d.paid < d.total" + ORDER, new Object[]{project, start, end}, HEADER);
      case "sal" -> CsvExport.query(jdbc, """
          select a.account_code, coalesce(sum(r.share_amount), 0) as allocated,
                 coalesce(sum(case when r.reporting = 'RENDICONTATO' then r.share_amount else 0 end), 0) as reported
          from financial_accounts a left join (
          """ + REGISTER.replace("select a.account_code,", "select a.id as account_id, a.account_code,") + """
          ) r on r.account_id = a.id
          where a.project_id = ? group by a.id, a.account_code order by a.account_code
          """, new Object[]{project, start, LocalDate.of(year, 6, 30), project},
          "Conto;Importo imputato per data fattura (primo semestre);Importo rendicontato");
      default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tipo di prospetto non valido.");
    };
  }

  private void validate(UUID project, int year) {
    if (year < 2000 || year > 2100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Annualità non valida.");
    if (jdbc.queryForObject("select count(*) from projects where id = ?", Integer.class, project) == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Progetto non trovato.");
    }
  }
}
