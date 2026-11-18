package it.progettochiaro.project.web;

import io.swagger.v3.oas.annotations.Operation;
import it.progettochiaro.ledger.TableImport;
import jakarta.validation.Validator;
import java.io.IOException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import it.progettochiaro.project.application.ProjectService;
import it.progettochiaro.project.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {
  private final ProjectService service;
  private final Validator validator;

  public ProjectController(ProjectService service, Validator validator) {
    this.service = service;
    this.validator = validator;
  }

  @PostMapping("/{projectId}/financial-accounts/import")
  @Transactional(rollbackFor = IOException.class)
  public Map<String, Integer> importAccounts(@PathVariable UUID projectId, @RequestParam MultipartFile file, @RequestParam(required = false) List<Integer> columns)
      throws IOException {
    Set<String> codes = new HashSet<>();
    service.accounts(projectId).forEach(account -> codes.add(account.getAccountCode()));
    int count = 0;
    int rowNumber = 1;
    for (var row : TableImport.read(file, List.of("codice di conto", "descrizione", "budget"), columns)) {
      rowNumber++;
      CreateFinancialAccountRequest account;
      try {
        account = new CreateFinancialAccountRequest(row.get(0).strip(), row.get(1).strip(), TableImport.amount(row.get(2)));
        if (!validator.validate(account).isEmpty()) throw new IllegalArgumentException();
      } catch (IllegalArgumentException exception) {
        throw new IllegalArgumentException("Verifica codice, descrizione e budget alla riga " + rowNumber + ".");
      }
      if (!codes.add(account.accountCode())) {
        throw new IllegalArgumentException("Codice conto già presente alla riga " + rowNumber + ".");
      }
      service.addAccount(projectId, account.accountCode(), account.description(), account.allocatedBudget());
      count++;
    }
    return Map.of("imported", count);
  }

  @GetMapping
  @Operation(summary = "Elenca i progetti")
  public List<ProjectResponse> list() { return service.list().stream().map(ProjectResponse::from).toList(); }

  @PostMapping
  @Operation(summary = "Crea un progetto SAI")
  public ResponseEntity<ProjectResponse> create(@Valid @RequestBody CreateProjectRequest request) {
    var project = service.create(request.name(), request.referenceCode(), request.funder(), request.startsOn(), request.endsOn());
    return ResponseEntity.status(HttpStatus.CREATED).body(ProjectResponse.from(project));
  }

  @GetMapping("/{projectId}/financial-accounts")
  public List<FinancialAccountResponse> accounts(@PathVariable UUID projectId) {
    return service.accounts(projectId).stream().map(FinancialAccountResponse::from).toList();
  }

  @PostMapping("/{projectId}/financial-accounts")
  @Operation(summary = "Aggiunge un conto al piano finanziario del progetto")
  public ResponseEntity<FinancialAccountResponse> addAccount(
      @PathVariable UUID projectId, @Valid @RequestBody CreateFinancialAccountRequest request) {
    var account = service.addAccount(projectId, request.accountCode(), request.description(), request.allocatedBudget());
    return ResponseEntity.status(HttpStatus.CREATED).body(FinancialAccountResponse.from(account));
  }

  public record CreateProjectRequest(@NotBlank @Size(max = 200) String name, @Size(max = 100) String referenceCode, @Size(max = 200) String funder, LocalDate startsOn, LocalDate endsOn) {}
  public record CreateFinancialAccountRequest(@NotBlank @Size(max = 100) String accountCode, @NotBlank @Size(max = 300) String description, @NotNull @DecimalMin(value = "0.00") @Digits(integer = 13, fraction = 2) BigDecimal allocatedBudget) {}
  public record ProjectResponse(UUID id, String name, String referenceCode, String funder, LocalDate startsOn, LocalDate endsOn, ProjectStatus status) {
    static ProjectResponse from(Project project) { return new ProjectResponse(project.getId(), project.getName(), project.getReferenceCode(), project.getFunder(), project.getStartsOn(), project.getEndsOn(), project.getStatus()); }
  }
  public record FinancialAccountResponse(UUID id, UUID projectId, String accountCode, String description, BigDecimal allocatedBudget) {
    static FinancialAccountResponse from(FinancialAccount account) { return new FinancialAccountResponse(account.getId(), account.getProjectId(), account.getAccountCode(), account.getDescription(), account.getAllocatedBudget()); }
  }
}

