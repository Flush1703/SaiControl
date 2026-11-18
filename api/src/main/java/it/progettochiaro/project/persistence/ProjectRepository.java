package it.progettochiaro.project.persistence;

import it.progettochiaro.project.domain.Project;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
  List<Project> findAllByOrderByCreatedAtDesc();
}

