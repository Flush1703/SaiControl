package it.progettochiaro.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/access")
public class AccessController {
  private final String username;
  private final String password;
  private final SecureRandom random = new SecureRandom();
  private final Map<String, Instant> sessions = new ConcurrentHashMap<>();

  public AccessController(@Value("${APP_LOGIN_USERNAME:}") String username,
                          @Value("${APP_LOGIN_PASSWORD:}") String password) {
    this.username = username;
    this.password = password;
  }

  @PostMapping
  public Map<String, String> login(@RequestBody Credentials credentials) {
    if (username.isBlank() || password.isBlank()) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!(matches(username, credentials.username()) & matches(password, credentials.password()))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }
    Instant now = Instant.now();
    sessions.values().removeIf(expiry -> !expiry.isAfter(now));
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(random.generateSeed(32));
    sessions.put(token, now.plusSeconds(8 * 3600));
    return Map.of("token", token);
  }

  @DeleteMapping
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(HttpServletRequest request) {
    sessions.remove(token(request));
  }

  public boolean authorized(HttpServletRequest request) {
    Instant expiry = sessions.get(token(request));
    return expiry != null && expiry.isAfter(Instant.now());
  }

  private static String token(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    return header != null && header.startsWith("Bearer ") ? header.substring(7) : "";
  }

  private static boolean matches(String expected, String supplied) {
    return supplied != null && MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8));
  }

  public record Credentials(String username, String password) {}
}
