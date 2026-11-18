package it.progettochiaro.project.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "financial_accounts")
public class FinancialAccount {
  @Id private UUID id;
  @Column(name = "project_id", nullable = false) private UUID projectId;
  @Column(name = "account_code", nullable = false) private String accountCode;
  @Column(nullable = false) private String description;
  @Column(name = "allocated_budget", nullable = false, precision = 15, scale = 2)
  private BigDecimal allocatedBudget;
  @Column(name = "created_at", nullable = false) private Instant createdAt;
  @Column(name = "updated_at", nullable = false) private Instant updatedAt;

  protected FinancialAccount() {}

  public FinancialAccount(UUID projectId, String accountCode, String description, BigDecimal allocatedBudget) {
    if (allocatedBudget.signum() < 0) throw new IllegalArgumentException("Il budget non può essere negativo.");
    id = UUID.randomUUID();
    this.projectId = projectId;
    this.accountCode = accountCode;
    this.description = description;
    this.allocatedBudget = allocatedBudget;
    createdAt = Instant.now();
    updatedAt = createdAt;
  }

  public UUID getId() { return id; }
  public UUID getProjectId() { return projectId; }
  public String getAccountCode() { return accountCode; }
  public String getDescription() { return description; }
  public BigDecimal getAllocatedBudget() { return allocatedBudget; }
}

