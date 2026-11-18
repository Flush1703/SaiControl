package it.progettochiaro.project.domain;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class ProjectTest {
  @Test
  void rejectsAnEndDateBeforeTheStartDate() {
    assertThatThrownBy(
            () ->
                new Project(
                    "SAI Milano",
                    "SAI-2026",
                    "Comune di Milano",
                    LocalDate.of(2026, 1, 1),
                    LocalDate.of(2025, 12, 31)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("fine");
  }
}
