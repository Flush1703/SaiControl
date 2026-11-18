package it.progettochiaro.ledger;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = {"APP_LOGIN_USERNAME=operatore", "APP_LOGIN_PASSWORD=password-di-test"})
@AutoConfigureMockMvc
class LedgerFlowTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  private static final String LEDGER = "/api/v1/ledger";
  private String authorization;

  @Test
  void reconcilesImportedInvoiceAndAppliesAttestedRevision() throws Exception {
    authorization = "Bearer " + json.readTree(call(post("/api/v1/access"),
        Map.of("username", "operatore", "password", "password-di-test"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("token").asText();
    String project = id(call(post("/api/v1/projects"), Map.of("name", "SAI Palermo")).andExpect(status().isCreated()));
    String accounts = "/api/v1/projects/" + project + "/financial-accounts";
    csv(accounts + "/import", "codice di conto;descrizione;budget\n001;Ufficio;1000\n002;Servizi;400\n")
        .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(2));
    var plan = json.readTree(call(get(accounts), null).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].accountCode").value("001")).andReturn().getResponse().getContentAsString());
    String source = plan.get(0).get("id").asText();
    String target = plan.get(1).get("id").asText();
    String invoiceXml = """
        <FatturaElettronica><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>123</IdCodice></IdFiscaleIVA>
        </DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader><FatturaElettronicaBody>
        <DatiGeneraliDocumento><Numero>F1</Numero><Data>2026-11-01</Data>
        <ImportoTotaleDocumento>100.00</ImportoTotaleDocumento><Causale>PROGETTO SAI PALERMO</Causale></DatiGeneraliDocumento>
        </FatturaElettronicaBody></FatturaElettronica>
        """;
    String origin = "http://localhost:5173";
    mvc.perform(options(LEDGER + "/files/preview").header("Origin", origin)
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "authorization"))
        .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin));
    file(LEDGER + "/files/preview", "files", "fattura.xml", invoiceXml).andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].number").value("F1"))
        .andExpect(jsonPath("$.results[0].projectReference").value("SAI PALERMO"))
        .andExpect(jsonPath("$.results[0].outcome").value("SENZA_QUOTE"));
    call(get(LEDGER), null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    var nested = new MockMultipartFile("files", "fattura.xml", "application/xml",
        invoiceXml.getBytes(StandardCharsets.UTF_8));
    call(multipart(LEDGER + "/files/preview").file(nested).file(nested)
        .param("paths", "2026/ottobre/fattura.xml", "2026/novembre/fattura.xml"), null)
        .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1))
        .andExpect(jsonPath("$.results[0].path").value("2026/ottobre/fattura.xml"))
        .andExpect(jsonPath("$.results[1].path").value("2026/novembre/fattura.xml"))
        .andExpect(jsonPath("$.results[1].outcome").value("DUPLICATO_FILE"));
    file(LEDGER + "/files", "files", "fattura.xml", invoiceXml).andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(1));
    file(LEDGER + "/files", "files", "copia.xml", invoiceXml).andExpect(status().isOk())
        .andExpect(jsonPath("$.skipped").value(1));
    file(LEDGER + "/files/preview", "files", "copia.xml", invoiceXml).andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(0))
        .andExpect(jsonPath("$.results[0].outcome").value("DUPLICATO_FILE"))
        .andExpect(jsonPath("$.results[0].projectReference").value("SAI PALERMO"));
    csv(LEDGER + "/rows", "fornitore;numero;data;importo\nIT123;F1;2026-11-01;100,00\n")
        .andExpect(status().isOk()).andExpect(jsonPath("$.skipped").value(1));
    var invoices = json.readTree(call(get(LEDGER), null).andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString());
    String invoice = invoices.get(0).get("id").asText();
    call(put(LEDGER + "/suppliers"), Map.of("supplier", "IT123", "projectId", project, "accountId", source))
        .andExpect(status().isOk());
    call(get(LEDGER + "/suppliers"), null).andExpect(status().isOk()).andExpect(jsonPath("$[0].account_code").value("001"));
    file(LEDGER + "/files/preview", "files", "seconda.xml",
        invoiceXml.replace("<Numero>F1</Numero>", "<Numero>F2</Numero>"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.assigned").value(0))
        .andExpect(jsonPath("$.results[0].projectAction").value("ESISTENTE"));
    call(multipart(LEDGER + "/files").file(new MockMultipartFile("files", "seconda.xml", "application/xml",
        invoiceXml.replace("<Numero>F1</Numero>", "<Numero>F2</Numero>").replace("2026-11-01", "2026-11-02").getBytes(StandardCharsets.UTF_8)))
        .param("applyRules", "true"), null)
        .andExpect(status().isOk()).andExpect(jsonPath("$.assigned").value(1));
    call(put(LEDGER + "/" + invoice + "/project"), Map.of("projectId", project))
        .andExpect(status().isNoContent());
    call(get(LEDGER), null).andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.id == '" + invoice + "')].manual_project_name").value(
            org.hamcrest.Matchers.contains("SAI Palermo")));
    String shares = LEDGER + "/" + invoice + "/shares";
    call(post(shares), Map.of("projectId", project, "accountId", source, "percentage", 60, "reporting", "RENDICONTATO"))
        .andExpect(status().isOk());
    call(post(shares), Map.of("projectId", project, "accountId", target, "percentage", 50, "reporting", "IN_VERIFICA"))
        .andExpect(status().isBadRequest());
    call(get(LEDGER), null).andExpect(status().isOk())
        .andExpect(jsonPath("$[0].shares[0].project_id").value(project));
    csv(LEDGER + "/bank/import", "riferimento;data;descrizione;importo\nBON-1;2026-11-02;F1;-100,00\n")
        .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1));
    String movement = json.readTree(call(get(LEDGER + "/bank"), null).andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString()).get(0).get("id").asText();
    call(post(LEDGER + "/bank/" + movement + "/match"), Map.of("documentId", invoice)).andExpect(status().isOk());
    call(get(LEDGER + "/export").param("projectId", project).param("payment", "SALDATO").param("reporting", "RENDICONTATO"), null)
        .andExpect(status().isOk()).andExpect(content().string(containsString("SAI Palermo")));
    String planning = "/api/v1/projects/" + project + "/planning";
    String revision = json.readTree(call(post(planning + "/revisions"),
        Map.of("sourceId", source, "targetId", target, "amount", 50, "reason", "Adeguamento"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).asText();
    String draft = json.readTree(call(post(planning + "/revisions"),
        Map.of("sourceId", source, "targetId", target, "amount", 20, "reason", "Da eliminare"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).asText();
    call(delete(planning + "/revisions/" + draft), null).andExpect(status().isNoContent());
    call(delete(planning + "/revisions/" + draft), null).andExpect(status().isNoContent());
    call(get(planning), null).andExpect(status().isOk())
        .andExpect(jsonPath("$.revisions.length()").value(1))
        .andExpect(jsonPath("$.revisions[0].id").value(revision))
        .andExpect(jsonPath("$.budget[0].available").value(840));
    call(post(planning + "/revisions/" + revision + "/approve"), Map.of("attested", false, "reference", "ATTO-1"))
        .andExpect(status().isBadRequest());
    call(post(planning + "/revisions/" + revision + "/approve"), Map.of("attested", true, "reference", "ATTO-1"))
        .andExpect(status().isOk());
    call(delete(planning + "/revisions/" + revision), null).andExpect(status().isConflict());
    call(get("/api/v1/projects/" + project + "/dossier").param("from", "2026-11-01").param("to", "2026-11-30"), null)
        .andExpect(status().isOk()).andExpect(jsonPath("$.documents").value(2));
    call(post(planning + "/staff"), Map.of("accountId", target, "roleName", "Operatore", "month", "2026-11", "hours", 20, "hourlyCost", 25))
        .andExpect(status().isOk());
    call(get(planning), null).andExpect(status().isOk())
        .andExpect(jsonPath("$.budget[0].available").value(790))
        .andExpect(jsonPath("$.budget[0].paid").value(60))
        .andExpect(jsonPath("$.budget[0].unpaid").value(100))
        .andExpect(jsonPath("$.staff[0].estimate").value(500));
    String newProjectXml = invoiceXml.replace("SAI PALERMO", "SAI SCIGLIANO")
        .replace("<Numero>F1</Numero>", "<Numero>SC1</Numero>");
    file(LEDGER + "/files/preview", "files", "scigliano.xml", newProjectXml)
        .andExpect(status().isOk()).andExpect(jsonPath("$.results[0].projectAction").value("DA_CREARE"));
    call(get("/api/v1/projects"), null).andExpect(jsonPath("$[?(@.name == 'SAI SCIGLIANO')]").isEmpty());
    call(multipart(LEDGER + "/files")
        .file(new MockMultipartFile("files", "scigliano.xml", "application/xml", newProjectXml.getBytes(StandardCharsets.UTF_8)))
        .file(new MockMultipartFile("files", "scigliano2.xml", "application/xml",
            newProjectXml.replace("SC1", "SC2").getBytes(StandardCharsets.UTF_8))), null)
        .andExpect(status().isOk()).andExpect(jsonPath("$.results[0].projectAction").value("CREATO"))
        .andExpect(jsonPath("$.results[1].projectAction").value("ESISTENTE"))
        .andExpect(jsonPath("$.assigned").value(0));
    call(get("/api/v1/projects"), null).andExpect(jsonPath("$[?(@.name == 'SAI SCIGLIANO')].status")
        .value(org.hamcrest.Matchers.contains("DRAFT")));
    call(get(LEDGER), null).andExpect(jsonPath("$[?(@.invoice_number == 'SC1')].manual_project_name")
        .value(org.hamcrest.Matchers.contains("SAI SCIGLIANO")));

  }

  private ResultActions call(MockHttpServletRequestBuilder request, Object body) throws Exception {
    if (authorization != null) request.header("Authorization", authorization);
    if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    return mvc.perform(request);
  }

  private String id(ResultActions actions) throws Exception {
    return json.readTree(actions.andReturn().getResponse().getContentAsString()).get("id").asText();
  }

  private ResultActions csv(String path, String contents) throws Exception {
    return file(path, "file", "import.csv", contents);
  }

  private ResultActions file(String path, String field, String filename, String contents) throws Exception {
    return call(multipart(path).file(new MockMultipartFile(field, filename, "application/octet-stream",
        contents.getBytes(StandardCharsets.UTF_8))), null);
  }
}
