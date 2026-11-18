package it.progettochiaro.ledger;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

public final class CsvExport {
  private CsvExport() {}

  public static String query(JdbcTemplate jdbc, String sql, Object[] args, String header) {
    StringBuilder csv = new StringBuilder("\ufeff").append(header).append("\r\n");
    jdbc.query(sql, (RowCallbackHandler) row -> {
      for (int index = 1; index <= row.getMetaData().getColumnCount(); index++) {
        if (index > 1) csv.append(';');
        String value = row.getString(index);
        if (value == null) value = "";
        if (row.getObject(index) instanceof String && value.stripLeading().matches("(?s)^[=+@-].*")) {
          value = "'" + value;
        }
        csv.append('"').append(value.replace("\"", "\"\"")).append('"');
      }
      csv.append("\r\n");
    }, args);
    return csv.toString();
  }
}
