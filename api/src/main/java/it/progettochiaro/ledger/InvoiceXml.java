package it.progettochiaro.ledger;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.bouncycastle.cms.CMSSignedData;
import org.w3c.dom.Element;
import org.xml.sax.helpers.DefaultHandler;

public final class InvoiceXml {
  private InvoiceXml() {}

  static boolean supported(String filename) {
    String name = filename.toLowerCase(Locale.ROOT);
    return name.endsWith(".xml") || name.endsWith(".xml.p7m");
  }

  public static List<LedgerController.Details> read(String filename, byte[] bytes) {
    var empty = new LedgerController.Details(null, null, null, null, false);
    String name = filename.toLowerCase(Locale.ROOT);
    if (!supported(filename)) return List.of(empty);
    try {
      if (name.endsWith(".p7m")) {
        var content = new CMSSignedData(bytes).getSignedContent();
        if (content == null || !(content.getContent() instanceof byte[] xml)) return List.of(empty);
        bytes = xml;
      }
      var factory = DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(true);
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
      var builder = factory.newDocumentBuilder();
      builder.setErrorHandler(new DefaultHandler());
      Element root = builder.parse(new ByteArrayInputStream(bytes)).getDocumentElement();
      String rootName = root.getLocalName();
      if (!"FatturaElettronica".equals(rootName) && !"FatturaElettronicaSemplificata".equals(rootName)) {
        return List.of(empty);
      }
      String bodyName = rootName + "Body";
      var bodies = root.getElementsByTagNameNS("*", bodyName);
      if (bodies.getLength() == 0) return List.of(empty);
      Element supplier = first(root, "CedentePrestatore");
      String country = value(supplier, "IdPaese");
      String vat = value(supplier, "IdCodice");
      String tax = country != null && vat != null ? country + vat : value(supplier, "CodiceFiscale");
      List<LedgerController.Details> invoices = new ArrayList<>();
      for (int index = 0; index < bodies.getLength(); index++) {
        Element body = (Element) bodies.item(index);
        Element invoice = first(body, "DatiGeneraliDocumento");
        String number = value(invoice, "Numero");
        String currency = value(invoice, "Divisa");
        BigDecimal total = currency == null || "EUR".equals(currency)
            ? amount(value(invoice, "ImportoTotaleDocumento")) : null;
        invoices.add(new LedgerController.Details(tax != null && tax.length() <= 250 ? tax : null,
            number != null && number.length() <= 100 ? number : null, date(value(invoice, "Data")), total, false, projectReference(body)));
      }
      return invoices;
    } catch (Exception exception) {
      return List.of(empty);
    }
  }

  private static String projectReference(Element body) {
    var cities = new java.util.TreeSet<String>();
    var sai = java.util.regex.Pattern.compile("(?iu)\\bPROGETTO\\s+SAI\\s+([\\p{L}’' -]+)");
    var numbered = java.util.regex.Pattern.compile("(?iu)\\bCOMUNE DI ([\\p{L}’' -]+)\\s*[-–]?\\s*PROGETTO\\s+\\d+");
    for (String tag : List.of("Causale", "Descrizione", "RiferimentoTesto")) {
      var nodes = body.getElementsByTagNameNS("*", tag);
      for (int i = 0; i < nodes.getLength(); i++) {
        String text = nodes.item(i).getTextContent();
        if (text.length() > 4096) continue;
        for (var pattern : List.of(sai, numbered)) {
          var match = pattern.matcher(text);
          while (match.find()) {
            String city = match.group(1).split("(?i)\\s+(?:FORNITURA|SERVIZIO|MESE|ANNO)\\b|\\s[-–]\\s", 2)[0].strip();
            if (!city.isEmpty() && city.length() <= 100) cities.add(city.toUpperCase(Locale.ITALIAN));
          }
        }
      }
    }
    return cities.size() == 1 ? "SAI " + cities.first() : null;
  }

  private static LocalDate date(String value) {
    if (value == null) return null;
    try {
      return LocalDate.parse(value);
    } catch (java.time.format.DateTimeParseException exception) {
      return null;
    }
  }

  private static BigDecimal amount(String value) {
    if (value == null) return null;
    try {
      BigDecimal total = new BigDecimal(value).stripTrailingZeros();
      return total.signum() >= 0 && total.scale() <= 2 && (long) total.precision() - total.scale() <= 13
          ? total : null;
    } catch (NumberFormatException exception) {
      return null;
    }
  }

  private static Element first(Element parent, String tag) {
    return parent == null ? null : (Element) parent.getElementsByTagNameNS("*", tag).item(0);
  }

  private static String value(Element parent, String tag) {
    Element element = first(parent, tag);
    return element == null || element.getTextContent().isBlank() ? null : element.getTextContent().strip();
  }
}
