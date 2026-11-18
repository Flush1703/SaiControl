package it.progettochiaro.pocket;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"APP_LOGIN_USERNAME=operatore", "APP_LOGIN_PASSWORD=password-di-test"})
@AutoConfigureMockMvc
class PocketMoneyFlowTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  @Test
  void protectsProjectsAndStoresReceiptWithAttachment() throws Exception {
    String projects = "/api/v1/projects";
    String access = "/api/v1/access";
    mvc.perform(get(projects)).andExpect(status().isUnauthorized());
    mvc.perform(post(access).contentType(MediaType.APPLICATION_JSON)
        .content(""" 
            {"username":"operatore","password":"errata"}
            """)).andExpect(status().isUnauthorized());
    String session = mvc.perform(post(access).contentType(MediaType.APPLICATION_JSON)
        .content("""
            {"username":"operatore","password":"password-di-test"}
            """)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    String authorization = "Bearer " + json.readTree(session).get("token").asText();
    String project = mvc.perform(post(projects).header("Authorization", authorization)
        .contentType(MediaType.APPLICATION_JSON).content("""
            {"name":"SAI Test"}
            """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    String receipts = projects + "/" + json.readTree(project).get("id").asText() + "/pocket-money";
    String receipt = mvc.perform(post(receipts).header("Authorization", authorization)
        .contentType(MediaType.APPLICATION_JSON).content("""
            {"beneficiary":"Mario Rossi","start":"2026-11-01","end":"2026-11-03","dailyRate":2.50}
            """)).andExpect(status().isCreated()).andExpect(jsonPath("$.days").value(3))
        .andExpect(jsonPath("$.amount").value(7.50))
        .andReturn().getResponse().getContentAsString();
    String attachments = receipts + "/" + json.readTree(receipt).get("id").asText() + "/attachments";
    byte[] contents = "Ricevuta firmata".getBytes(StandardCharsets.UTF_8);
    String attachment = mvc.perform(multipart(attachments)
        .file(new MockMultipartFile("file", "ricevuta.pdf", "application/pdf", contents))
        .header("Authorization", authorization)).andExpect(status().isCreated())
        .andReturn().getResponse().getContentAsString();
    String download = attachments + "/" + json.readTree(attachment).get("id").asText();
    mvc.perform(get(receipts).header("Authorization", authorization))
        .andExpect(status().isOk()).andExpect(jsonPath("$[0].attachments[0].filename").value("ricevuta.pdf"));
    mvc.perform(get(download).header("Authorization", authorization))
        .andExpect(status().isOk()).andExpect(content().bytes(contents));
    mvc.perform(delete(access).header("Authorization", authorization)).andExpect(status().isNoContent());
    mvc.perform(get(download).header("Authorization", authorization)).andExpect(status().isUnauthorized());
  }
}
