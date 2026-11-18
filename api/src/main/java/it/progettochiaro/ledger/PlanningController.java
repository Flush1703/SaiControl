package it.progettochiaro.ledger;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/planning")
public class PlanningController {
  private final JdbcTemplate jdbc;

  public PlanningController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private static final String BUDGET = """
      with cumulative as (
        select s.*, d.paid, d.total,
          sum(s.amount) over (partition by s.document_id order by s.id rows unbounded preceding) as portion
        from ledger_shares s join ledger_documents d on d.id = s.document_id
        where s.document_id in (
          select x.document_id from ledger_shares x join financial_accounts fa on fa.id = x.account_id
          where fa.project_id = ?
        )
      ), portions as (
        select cumulative.*,
          coalesce(round(paid * portion / nullif(total, 0), 2)
          - round(paid * (portion - amount) / nullif(total, 0), 2), 0) as paid_portion
        from cumulative
      )
      select a.id, a.account_code, a.description, a.allocated_budget,
             coalesce(sum(case when s.reporting <> 'ESCLUSO' then s.amount else 0 end), 0) as allocated,
             coalesce(sum(case when s.reporting = 'RENDICONTATO' then s.amount else 0 end), 0) as reported,
             a.allocated_budget - coalesce(sum(case when s.reporting <> 'ESCLUSO' then s.amount else 0 end), 0) as available,
             coalesce(sum(case when s.reporting <> 'ESCLUSO' then s.paid_portion else 0 end), 0) as paid,
             coalesce(sum(case when s.reporting <> 'ESCLUSO' then s.amount - s.paid_portion else 0 end), 0) as unpaid
      from financial_accounts a left join portions s on s.account_id = a.id
      where a.project_id = ?
      group by a.id, a.account_code, a.description, a.allocated_budget order by a.account_code
      """;
  private static final String REVISIONS = """
      select r.id, a.account_code as source, b.account_code as target, r.amount, r.reason,
             r.approval_reference, r.approved_at, a.allocated_budget - r.amount as source_after,
             b.allocated_budget + r.amount as target_after
      from budget_revisions r join financial_accounts a on a.id = r.source_id
      join financial_accounts b on b.id = r.target_id where r.project_id = ?
      order by r.approved_at desc nulls first, r.id
      """;
  private static final String STAFF = """
      select s.id, a.account_code, s.role_name, s.month_start, s.hours, s.hourly_cost,
             round(s.hours * s.hourly_cost, 2) as estimate
      from staff_estimates s join financial_accounts a on a.id = s.account_id
      where s.project_id = ? order by s.month_start, a.account_code, s.role_name
      """;

  @GetMapping
  public Map<String, Object> list(@PathVariable UUID projectId) {
    return Map.of("budget", jdbc.queryForList(BUDGET, projectId, projectId),
        "revisions", jdbc.queryForList(REVISIONS, projectId), "staff", jdbc.queryForList(STAFF, projectId));
  }

  @PostMapping("/revisions")
  public UUID simulate(@PathVariable UUID projectId, @Valid @RequestBody Revision revision) {
    if (revision.sourceId().equals(revision.targetId())) throw bad("Scegli due conti diversi.");
    account(projectId, revision.sourceId());
    account(projectId, revision.targetId());
    UUID id = UUID.randomUUID();
    jdbc.update("""
        insert into budget_revisions (id, project_id, source_id, target_id, amount, reason)
        values (?, ?, ?, ?, ?, ?)
        """, id, projectId, revision.sourceId(), revision.targetId(), revision.amount(), revision.reason().strip());
    return id;
  }

  @DeleteMapping("/revisions/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteRevision(@PathVariable UUID projectId, @PathVariable UUID id) {
    int deleted = jdbc.update("""
        delete from budget_revisions where id = ? and project_id = ? and approved_at is null
        """, id, projectId);
    if (deleted == 0 && jdbc.queryForObject(
        "select count(*) from budget_revisions where id = ? and project_id = ?", Integer.class, id, projectId) > 0) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "La rimodulazione è già stata applicata.");
    }
  }

  @PostMapping("/revisions/{id}/approve")
  @Transactional
  public void approve(@PathVariable UUID projectId, @PathVariable UUID id, @Valid @RequestBody Approval approval) {
    if (!approval.attested()) throw bad("Attesta l’approvazione formale prima di applicare.");
    var revision = jdbc.queryForList("""
        select source_id, target_id, amount, approved_at from budget_revisions
        where id = ? and project_id = ? for update
        """, id, projectId).stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    if (revision.get("approved_at") != null) throw bad("Rimodulazione già applicata.");
    UUID source = (UUID) revision.get("source_id");
    UUID target = (UUID) revision.get("target_id");
    BigDecimal amount = (BigDecimal) revision.get("amount");
    jdbc.queryForList("select id from financial_accounts where id in (?, ?) order by id for update", source, target);
    BigDecimal available = jdbc.queryForObject("""
        select a.allocated_budget - coalesce((select sum(s.amount) from ledger_shares s
          where s.account_id = a.id and s.reporting <> 'ESCLUSO'), 0)
        from financial_accounts a where a.id = ?
        """, BigDecimal.class, source);
    if (available.compareTo(amount) < 0) throw bad("Il budget residuo del conto di origine è insufficiente.");
    jdbc.update("update financial_accounts set allocated_budget = allocated_budget - ?, updated_at = current_timestamp where id = ?", amount, source);
    jdbc.update("update financial_accounts set allocated_budget = allocated_budget + ?, updated_at = current_timestamp where id = ?", amount, target);
    jdbc.update("update budget_revisions set approved_at = current_timestamp, approval_reference = ? where id = ?",
        approval.reference().strip(), id);
  }

  @PostMapping("/staff")
  public UUID staff(@PathVariable UUID projectId, @Valid @RequestBody Staff staff) {
    account(projectId, staff.accountId());
    LocalDate month;
    try {
      month = YearMonth.parse(staff.month()).atDay(1);
    } catch (RuntimeException exception) {
      throw bad("Mese non valido.");
    }
    UUID id = UUID.randomUUID();
    jdbc.update("""
        insert into staff_estimates (id, project_id, account_id, role_name, month_start, hours, hourly_cost)
        values (?, ?, ?, ?, ?, ?, ?)
        """, id, projectId, staff.accountId(), staff.roleName().strip(), month, staff.hours(), staff.hourlyCost());
    return id;
  }

  @DeleteMapping("/staff/{id}")
  public void deleteStaff(@PathVariable UUID projectId, @PathVariable UUID id) {
    if (jdbc.update("delete from staff_estimates where id = ? and project_id = ?", id, projectId) == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
  }

  @GetMapping(value = "/export", produces = "text/csv;charset=UTF-8")
  public String export(@PathVariable UUID projectId, @RequestParam String type) {
    Object[] args = {projectId};
    return switch (type) {
      case "budget" -> CsvExport.query(jdbc, BUDGET, new Object[]{projectId, projectId}, "ID conto;Codice;Descrizione;Budget;Imputato;Rendicontato;Residuo budget;Pagato sulle quote;Da pagare sulle quote");
      case "revisions" -> CsvExport.query(jdbc, REVISIONS, args, "ID;Da conto;A conto;Importo;Motivo;Riferimento approvazione;Data applicazione;Simulazione saldo origine;Simulazione saldo destinazione");
      case "staff" -> CsvExport.query(jdbc, STAFF, args, "ID;Conto;Ruolo;Mese;Ore;Costo orario;Stima");
      default -> throw bad("Report non disponibile.");
    };
  }

  private void account(UUID projectId, UUID accountId) {
    if (jdbc.queryForObject("select count(*) from financial_accounts where project_id = ? and id = ?",
        Integer.class, projectId, accountId) == 0) throw bad("Conto non valido per il progetto.");
  }

  private static ResponseStatusException bad(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  public record Revision(@NotNull UUID sourceId, @NotNull UUID targetId,
                         @NotNull @DecimalMin("0.01") @Digits(integer = 13, fraction = 2) BigDecimal amount,
                         @NotBlank @Size(max = 500) String reason) {}
  public record Approval(boolean attested, @NotBlank @Size(max = 250) String reference) {}
  public record Staff(@NotNull UUID accountId, @NotBlank @Size(max = 200) String roleName,
                      @NotBlank String month,
                      @NotNull @DecimalMin("0.01") @Digits(integer = 6, fraction = 2) BigDecimal hours,
                      @NotNull @DecimalMin("0") @Digits(integer = 8, fraction = 2) BigDecimal hourlyCost) {}
}
