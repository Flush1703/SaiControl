package it.progettochiaro.ledger;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class InvoiceXmlTest {
  @Test
  void readsEachBodyAndPreservesFieldsWhenTotalIsMissing() {
    var invoices = read("""
        <p:FatturaElettronica xmlns:p="urn:fattura">
          <FatturaElettronicaHeader><CedentePrestatore><CodiceFiscale>TEST001</CodiceFiscale></CedentePrestatore></FatturaElettronicaHeader>
          <FatturaElettronicaBody><DatiGeneraliDocumento>
            <Numero>001/A</Numero><Data>2026-11-18</Data><Divisa>EUR</Divisa><ImportoTotaleDocumento>120.50</ImportoTotaleDocumento>
          </DatiGeneraliDocumento></FatturaElettronicaBody>
          <FatturaElettronicaBody><DatiGeneraliDocumento>
            <Numero>002/A</Numero><Data>2026-11-19</Data>
          </DatiGeneraliDocumento></FatturaElettronicaBody>
        </p:FatturaElettronica>
        """);
    assertEquals(2, invoices.size());
    assertEquals("TEST001", invoices.getFirst().supplier());
    assertEquals(0, new BigDecimal("120.50").compareTo(invoices.getFirst().total()));
    assertEquals("002/A", invoices.getLast().invoiceNumber());
    assertNull(invoices.getLast().total());
  }

  @Test
  void keepsSimplifiedInvoiceForReviewAndDoesNotTreatForeignCurrencyAsEuros() {
    var invoice = read("""
        <FatturaElettronicaSemplificata><FatturaElettronicaSemplificataBody>
          <DatiGeneraliDocumento><Numero>F1</Numero><Divisa>USD</Divisa><ImportoTotaleDocumento>100</ImportoTotaleDocumento></DatiGeneraliDocumento>
        </FatturaElettronicaSemplificataBody></FatturaElettronicaSemplificata>
        """).getFirst();
    assertEquals("F1", invoice.invoiceNumber());
    assertNull(invoice.total());
  }

  @Test
  void archivesUnexpectedOrUnsafeXmlForReview() {
    assertNull(read("<notifica><Numero>1</Numero></notifica>").getFirst().invoiceNumber());
    assertNull(read("<!DOCTYPE FatturaElettronica SYSTEM 'file:///invalid'><FatturaElettronica/>").getFirst().invoiceNumber());
  }

  @Test
  void extractsXmlEncapsulatedInCms() throws Exception {
    byte[] xml = """
        <FatturaElettronica><FatturaElettronicaBody><DatiGeneraliDocumento><Numero>CMS-1</Numero>
        </DatiGeneraliDocumento></FatturaElettronicaBody></FatturaElettronica>
        """.getBytes(StandardCharsets.UTF_8);
    var generator = new org.bouncycastle.cms.CMSSignedDataGenerator();
    byte[] container = generator.generate(new org.bouncycastle.cms.CMSProcessableByteArray(xml), true).getEncoded();
    assertEquals("CMS-1", InvoiceXml.read("fattura.xml.p7m", container).getFirst().invoiceNumber());
  }

  @Test
  void recognizesProjectFromExplicitCausaleOrNumberedMunicipalProject() {
    assertEquals("SAI SCIGLIANO", project("<Causale>PROGETTO SAI SCIGLIANO FORNITURA - OTTOBRE 2026</Causale>"));
    assertEquals("SAI SCIGLIANO", project("<Descrizione>Comune di Scigliano\n-Progetto 90 - PR-3</Descrizione>"));
    assertNull(project("<Descrizione>Consegna a Scigliano</Descrizione>"));
    assertNull(project("<Causale>PROGETTO SAI SCIGLIANO</Causale><Causale>PROGETTO SAI CATANIA</Causale>"));
  }

  private static String project(String fields) {
    return read("<FatturaElettronica><FatturaElettronicaBody>" + fields
        + "</FatturaElettronicaBody></FatturaElettronica>").getFirst().projectReference();
  }

  private static java.util.List<LedgerController.Details> read(String xml) {
    return InvoiceXml.read("fattura.XML", xml.getBytes(StandardCharsets.UTF_8));
  }
}
