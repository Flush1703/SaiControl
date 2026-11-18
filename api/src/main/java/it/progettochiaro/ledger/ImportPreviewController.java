package it.progettochiaro.ledger;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/import-preview")
public class ImportPreviewController {
  @PostMapping
  public Map<String, Object> preview(@RequestParam MultipartFile file) throws IOException {
    var rows = TableImport.raw(file);
    return Map.of("headers", rows.getFirst(), "count", rows.size() - 1,
        "sample", rows.subList(1, Math.min(rows.size(), 11)));
  }
}
