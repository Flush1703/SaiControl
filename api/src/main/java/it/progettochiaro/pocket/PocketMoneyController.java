package it.progettochiaro.pocket;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/pocket-money")
public class PocketMoneyController {
  private final JdbcTemplate jdbc;

  public PocketMoneyController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping
  public List<Receipt> list(@PathVariable UUID projectId) {
    return jdbc.query("""
        select id, beneficiary, start_date, end_date, daily_rate, absent_days from pocket_money
        where project_id = ? order by start_date desc, beneficiary
        """, (row, index) -> receipt(row.getObject("id", UUID.class), new Calculation(
        row.getString("beneficiary"), row.getObject("start_date", LocalDate.class),
        row.getObject("end_date", LocalDate.class), row.getBigDecimal("daily_rate"), row.getInt("absent_days"))), projectId);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Receipt create(@PathVariable UUID projectId, @Valid @RequestBody Calculation calculation) {
    if (calculation.end().isBefore(calculation.start())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Periodo non valido");
    }
    if (calculation.absences() > ChronoUnit.DAYS.between(calculation.start(), calculation.end()) + 1) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le assenze superano i giorni del periodo.");
    }
    UUID id = UUID.randomUUID();
    int inserted = jdbc.update("""
        insert into pocket_money (id, project_id, beneficiary, start_date, end_date, daily_rate, absent_days)
        select ?, id, ?, ?, ?, ?, ? from projects where id = ?
        """, id, calculation.beneficiary().strip(), calculation.start(), calculation.end(), calculation.dailyRate(), calculation.absences(), projectId);
    if (inserted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return receipt(id, calculation);
  }

  @PostMapping("/{id}/attachments")
  @ResponseStatus(HttpStatus.CREATED)
  public Attachment upload(@PathVariable UUID projectId, @PathVariable UUID id,
                           @RequestParam MultipartFile file) throws IOException {
    String filename = file.getOriginalFilename();
    if (file.isEmpty() || filename == null || filename.isBlank() || filename.length() > 255
        || filename.chars().anyMatch(Character::isISOControl)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Allegato non valido");
    }
    UUID attachmentId = UUID.randomUUID();
    int inserted = jdbc.update("""
        insert into pocket_money_attachments (id, receipt_id, filename, contents)
        select ?, id, ?, ? from pocket_money where id = ? and project_id = ?
        """, attachmentId, filename, Base64.getEncoder().encodeToString(file.getBytes()), id, projectId);
    if (inserted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    return new Attachment(attachmentId, filename);
  }

  @GetMapping("/{id}/attachments/{attachmentId}")
  public ResponseEntity<byte[]> download(@PathVariable UUID projectId, @PathVariable UUID id,
                                         @PathVariable UUID attachmentId) {
    return jdbc.query("""
        select a.filename, a.contents from pocket_money_attachments a
        join pocket_money p on p.id = a.receipt_id
        where p.project_id = ? and p.id = ? and a.id = ?
        """, (row, index) -> ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
            .filename(row.getString("filename"), StandardCharsets.UTF_8).build().toString())
        .body(Base64.getDecoder().decode(row.getString("contents"))), projectId, id, attachmentId)
        .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  private Receipt receipt(UUID id, Calculation calculation) {
    long days = ChronoUnit.DAYS.between(calculation.start(), calculation.end()) + 1 - calculation.absences();
    var attachments = jdbc.query("""
        select id, filename from pocket_money_attachments where receipt_id = ? order by filename, id
        """, (row, index) -> new Attachment(row.getObject("id", UUID.class), row.getString("filename")), id);
    return new Receipt(id, calculation, days, calculation.dailyRate().multiply(BigDecimal.valueOf(days)), attachments);
  }

  public record Calculation(@NotBlank @Size(max = 200) String beneficiary, @NotNull LocalDate start,
                            @NotNull LocalDate end, @NotNull @DecimalMin("0")
                            @Digits(integer = 10, fraction = 2) BigDecimal dailyRate, @PositiveOrZero Integer absentDays) {
    int absences() { return absentDays == null ? 0 : absentDays; }
  }
  public record Receipt(UUID id, Calculation calculation, long days, BigDecimal amount,
                        List<Attachment> attachments) {}
  public record Attachment(UUID id, String filename) {}
}
