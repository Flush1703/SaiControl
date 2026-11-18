package it.progettochiaro.ledger;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/projects/{project}/reporting-checklist/{year}")
public class ReportingChecklistController {
  private final JdbcTemplate jdbc;

  public ReportingChecklistController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping
  public List<Item> items(@PathVariable UUID project, @PathVariable int year) {
    validate(project, year);
    return jdbc.query("""
        select item_code, item_status, notes from reporting_checklist
        where project_id = ? and reporting_year = ? order by item_code
        """, (row, index) -> new Item(row.getString(1), Status.valueOf(row.getString(2)), row.getString(3)),
        project, year);
  }

  @PutMapping
  @Transactional
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void save(@PathVariable UUID project, @PathVariable int year, @Valid @RequestBody Item item) {
    validate(project, year);
    if (item.status() == Status.NON_APPLICABILE && item.notes().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica il motivo della non applicabilità.");
    }
    jdbc.queryForObject("select id from projects where id = ? for update", UUID.class, project);
    int changed = jdbc.update("""
        update reporting_checklist set item_status = ?, notes = ?
        where project_id = ? and reporting_year = ? and item_code = ?
        """, item.status().name(), item.notes().strip(), project, year, item.code());
    if (changed == 0) jdbc.update("""
        insert into reporting_checklist (project_id, reporting_year, item_code, item_status, notes)
        values (?, ?, ?, ?, ?)
        """, project, year, item.code(), item.status().name(), item.notes().strip());
  }

  private void validate(UUID project, int year) {
    if (year < 2000 || year > 2100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Annualità non valida.");
    if (jdbc.queryForObject("select count(*) from projects where id = ?", Integer.class, project) == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Progetto non trovato.");
    }
  }

  public enum Status { DA_VERIFICARE, VERIFICATO, NON_APPLICABILE }
  public record Item(@NotBlank @Pattern(regexp = "[a-z0-9-]{1,40}") String code, @NotNull Status status,
                     @NotNull @Size(max = 500) String notes) {}
}
