package db.migration;

import it.progettochiaro.ledger.InvoiceXml;
import java.util.Base64;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V9__recover_invoice_project_references extends BaseJavaMigration {
  @Override
  public void migrate(Context context) throws Exception {
    var connection = context.getConnection();
    try (var query = connection.prepareStatement("""
        select d.id, d.invoice_number, d.invoice_date, f.filename, f.contents
        from ledger_documents d join ledger_document_files l on l.document_id = d.id
        join ledger_files f on f.hash = l.hash
        where d.project_reference is null and
          (lower(f.filename) like '%.xml' or lower(f.filename) like '%.xml.p7m')
        """);
        var save = connection.prepareStatement("""
            update ledger_documents set project_reference = ? where id = ? and project_reference is null
            """)) {
      query.setFetchSize(25);
      try (var rows = query.executeQuery()) {
        while (rows.next()) {
          var invoices = InvoiceXml.read(rows.getString("filename"),
              Base64.getDecoder().decode(rows.getString("contents")));
          String number = rows.getString("invoice_number");
          String date = rows.getString("invoice_date");
          var matches = invoices.stream().filter(invoice -> invoices.size() == 1 ||
              (invoice.invoiceNumber() != null && invoice.invoiceNumber().equals(number)
               && invoice.invoiceDate() != null && invoice.invoiceDate().toString().equals(date)))
              .toList();
          if (matches.size() == 1 && matches.getFirst().projectReference() != null) {
            save.setString(1, matches.getFirst().projectReference());
            save.setObject(2, rows.getObject("id"));
            save.executeUpdate();
          }
        }
      }
    }
  }

}
