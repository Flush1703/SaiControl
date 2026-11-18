package it.progettochiaro.ledger;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.*;
import org.apache.commons.csv.CSVFormat;
import org.apache.poi.ss.usermodel.*;
import org.springframework.web.multipart.MultipartFile;

public final class TableImport {
  private TableImport() {}

  public static List<List<String>> read(MultipartFile file, List<String> headers) throws IOException {
    return read(file, headers, null);
  }

  public static List<List<String>> read(MultipartFile file, List<String> headers, List<Integer> columns) throws IOException {
    var table = raw(file);
    var source = table.removeFirst();
    if (columns == null) {
      if (!source.stream().map(value -> value.strip().toLowerCase(Locale.ROOT)).toList().equals(headers)) {
        throw new IllegalArgumentException("Intestazioni richieste: " + String.join(", ", headers));
      }
      columns = java.util.stream.IntStream.range(0, headers.size()).boxed().toList();
    }
    if (columns.size() != headers.size() || new HashSet<>(columns).size() != columns.size()
        || columns.stream().anyMatch(index -> index < 0 || index >= source.size())) {
      throw new IllegalArgumentException("Associa una colonna diversa a ogni campo.");
    }
    List<List<String>> mapped = new ArrayList<>();
    for (var row : table) {
      List<String> values = new ArrayList<>();
      for (int index : columns) values.add(index < row.size() ? row.get(index) : "");
      if (values.stream().anyMatch(value -> !value.isBlank())) mapped.add(values);
    }
    return mapped;
  }

  public static List<List<String>> raw(MultipartFile file) throws IOException {
    String name = Objects.toString(file.getOriginalFilename(), "").toLowerCase(Locale.ROOT);
    List<List<String>> rows = new ArrayList<>();
    if (name.endsWith(".csv")) {
      try (var reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
        reader.mark(65536);
        String line = reader.readLine();
        if (line == null) throw new IllegalArgumentException("File vuoto.");
        reader.reset();
        char delimiter = line.contains(";") ? ';' : ',';
        try (var csv = CSVFormat.DEFAULT.builder().setDelimiter(delimiter).get().parse(reader)) {
          for (var record : csv) rows.add(record.toList());
        }
      }
    } else if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
      try (var workbook = WorkbookFactory.create(file.getInputStream())) {
        var formatter = new DataFormatter(Locale.ITALY);
        formatter.setUseCachedValuesForFormulaCells(true);
        for (Row row : workbook.getSheetAt(0)) {
          List<String> values = new ArrayList<>();
          for (int index = 0; index < row.getLastCellNum(); index++) {
            Cell cell = row.getCell(index);
            if (cell != null && cell.getCellType() == CellType.NUMERIC
                && DateUtil.isCellDateFormatted(cell)) {
              values.add(cell.getLocalDateTimeCellValue().toLocalDate().toString());
            } else {
              values.add(formatter.formatCellValue(cell));
            }
          }
          if (values.stream().anyMatch(value -> !value.isBlank())) rows.add(values);
        }
      }
    } else throw new IllegalArgumentException("Carica un file XLSX, XLSM o CSV.");
    if (rows.isEmpty()) throw new IllegalArgumentException("File vuoto.");
    rows.set(0, rows.getFirst().stream().map(value -> value.replace("\ufeff", "")).toList());
    return rows;
  }

  public static BigDecimal amount(String value) {
    String text = value.strip().replace("€", "").replace(" ", "");
    if (text.contains(",")) text = text.replace(".", "").replace(',', '.');
    return new BigDecimal(text);
  }
}
