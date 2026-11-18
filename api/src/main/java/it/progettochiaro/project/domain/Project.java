package it.progettochiaro.project.domain;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "projects")
public class Project {
  @Id private UUID id;
  @Column(nullable = false) private String name;
  @Column(name = "reference_code") private String referenceCode;
  private String funder;
  @Column(name = "starts_on") private LocalDate startsOn;
  @Column(name = "ends_on") private LocalDate endsOn;
  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ProjectStatus status;
  @Column(name = "created_at", nullable = false) private Instant createdAt;
  @Column(name = "updated_at", nullable = false) private Instant updatedAt;

  protected Project() {}

  public Project(String name, String referenceCode, String funder, LocalDate startsOn, LocalDate endsOn) {
    if (endsOn != null && startsOn != null && endsOn.isBefore(startsOn)) {
      throw new IllegalArgumentException("La data di fine deve seguire la data di inizio.");
    }
    id = UUID.randomUUID();
    this.name = name;
    this.referenceCode = referenceCode;
    this.funder = funder;
    this.startsOn = startsOn;
    this.endsOn = endsOn;
    status = ProjectStatus.DRAFT;
    createdAt = Instant.now();
    updatedAt = createdAt;
  }

  public UUID getId() { return id; }
  public String getName() { return name; }
  public String getReferenceCode() { return referenceCode; }
  public String getFunder() { return funder; }
  public LocalDate getStartsOn() { return startsOn; }
  public LocalDate getEndsOn() { return endsOn; }
  public ProjectStatus getStatus() { return status; }
  public Instant getCreatedAt() { return createdAt; }
}

