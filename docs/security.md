# Seguridad – OpsControl AI

## Modelo de Amenazas

| Amenaza | Mitigación |
|---|---|
| Suplantación de Meta webhook | Verificación de firma HMAC-SHA256 (X-Hub-Signature-256) |
| Acceso no autorizado al dashboard | Entra ID + MFA obligatorio |
| Fuga de datos entre tenants | Partition key `/tenantId` en Cosmos DB + scoping en queries |
| Exposición de API keys | Azure Key Vault + Managed Identity (sin strings en código) |
| DDoS en webhooks | Azure APIM con rate limiting por tier + Front Door WAF |
| Inyección de prompts | Content filtering de Azure OpenAI + sanitización de input |

## Secretos y Credenciales

**Nunca hay credenciales hardcodeadas**. Todos los secretos residen en Azure Key Vault:
- `CosmosDbConnectionString` – cadena de conexión Cosmos DB
- `OpenAiApiKey` – API Key de Azure OpenAI
- `MetaWebhookVerifyToken` – token de verificación de Meta
- `wa-token-{tenantId}` – tokens de API de Meta por tenant

Las Azure Functions acceden a Key Vault mediante **Managed Identity** (RBAC: `Key Vault Secrets User`).

## Autenticación y Autorización

### Admin Dashboard
- MSAL.js v3 con Entra ID (Azure AD B2B)
- Scopes: `User.Read`, `api://opscontrolai-backend/Tenant.Manage`
- Roles: `Platform.SuperAdmin`, `Tenant.Admin`, `Tenant.Viewer`

### APIs de Admin (Backend)
- JWT firmado por Entra ID → validado con JWKS (RS256)
- Cada endpoint admin verifica role claims antes de procesar

### Webhooks de WhatsApp
- `authLevel: anonymous` (Meta no puede enviar function keys)
- Verificación de firma con APP_SECRET de Meta

## Cumplimiento LFPDPPP (México)

- **Aviso de Privacidad**: publicar en `/legal/aviso-privacidad`
- **Retención**: TTL de 90 días en container `analytics` (auto-delete en Cosmos DB)
- **Eliminación de datos**: endpoint `DELETE /api/tenants/{id}/contacts/{contactId}/data`
- **Portabilidad**: endpoint `GET /api/tenants/{id}/contacts/{contactId}/export`
- **RFC validation**: regex `^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$`

## Monitoreo de Seguridad

Alertas en Application Insights:
- Más de 10 autenticaciones fallidas en 5 minutos → email a admin
- Tasa de error en API de WhatsApp > 5% → email a admin
- Spike anormal de requests (posible DDoS) → revisar logs

```kql
// Intentos de autenticación fallidos
requests
| where timestamp > ago(5m)
| where url contains "/api/admin" and success == false
| summarize count()
| where count_ > 10
```

## Cifrado

| Capa | Mecanismo |
|---|---|
| En tránsito | TLS 1.2 mínimo en todos los endpoints |
| En reposo – Cosmos DB | Cifrado AES-256 con claves Microsoft-managed |
| En reposo – Blob Storage | Cifrado AES-256 (SSE) |
| En reposo – Key Vault | HSM-protected en tier Standard |
| Variables de entorno | Key Vault references (nunca valores planos) |
