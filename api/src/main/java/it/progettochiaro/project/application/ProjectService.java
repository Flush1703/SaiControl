package it.progettochiaro.project.application;

import it.progettochiaro.project.domain.*;
import it.progettochiaro.project.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {
  private final ProjectRepository projects;
  private final FinancialAccountRepository accounts;

  public ProjectService(ProjectRepository projects, FinancialAccountRepository accounts) {
    this.projects = projects;
    this.accounts = accounts;
  }

  public List<Project> list() { return projects.findAllByOrderByCreatedAtDesc(); }

  @Transactional
  public Project create(String name, String referenceCode, String funder, LocalDate startsOn, LocalDate endsOn) {
    return projects.saveAndFlush(new Project(name, referenceCode, funder, startsOn, endsOn));
  }

  public List<FinancialAccount> accounts(UUID projectId) {
    requireProject(projectId);
    return accounts.findByProjectIdOrderByAccountCode(projectId);
  }

  @Transactional
  public FinancialAccount addAccount(UUID projectId, String code, String description, BigDecimal budget) {
    requireProject(projectId);
    return accounts.save(new FinancialAccount(projectId, code, description, budget));
  }

  private void requireProject(UUID projectId) {
    if (!projects.existsById(projectId)) throw new NoSuchElementException("Progetto non trovato.");
  }
}

