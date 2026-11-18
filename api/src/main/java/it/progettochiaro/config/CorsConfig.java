package it.progettochiaro.config;

import java.util.List;
import it.progettochiaro.auth.AccessController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
  private final List<String> origins;

  private final AccessController access;

  public CorsConfig(@Value("${app.cors.allowed-origins}") String allowedOrigins, AccessController access) {
    this.access = access;
    this.origins = List.of(allowedOrigins.split(",")).stream().map(String::trim).toList();
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(new HandlerInterceptor() {
      @Override
      public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equals(request.getMethod()) || access.authorized(request)) return true;
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        return false;
      }
    }).addPathPatterns("/api/v1/**").excludePathPatterns("/api/v1/access");
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/api/**")
        .allowedOrigins(origins.toArray(String[]::new))
        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
        .allowedHeaders("*");
  }
}

