package it.progettochiaro.project.persistence;

import it.progettochiaro.project.domain.FinancialAccount;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialAccountRepository extends JpaRepository<FinancialAccount, UUID> {
  List<FinancialAccount> findByProjectIdOrderByAccountCode(UUID projectId);
}

