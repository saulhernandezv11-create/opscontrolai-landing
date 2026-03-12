# Guía de Deployment – OpsControl AI

## Prerrequisitos

- Azure CLI >= 2.60
- Node.js >= 20 LTS
- Azure Functions Core Tools v4
- GitHub account con permisos de Actions
- Suscripción de Azure con acceso a:
  - Azure OpenAI (acceso aprobado)
  - Mexico Central region
  - API Management

## Paso 1: Configurar Azure CLI

```bash
az login
az account set --subscription "TU_SUBSCRIPTION_ID"
```

## Paso 2: Crear Resource Group

```bash
az group create \
  --name opscontrol-prod-rg \
  --location mexicocentral \
  --tags Environment=prod Product=OpsControlAI
```

## Paso 3: Deploy Bicep Infrastructure

```bash
cd infrastructure
./deploy.sh --env prod --resource-group opscontrol-prod-rg
```

El script realiza:
1. Deploy de todos los módulos Bicep
2. Habilita static website en Blob Storage
3. Crea alerta de costo ($10,000 MXN)

## Paso 4: Poblar Secretos en Key Vault

Tras el deploy, configura estos secretos manualmente:

```bash
KV_NAME="opsctrl-kv-prod-XXXXXX"

# Token de verificación de webhook de Meta
az keyvault secret set \
  --vault-name $KV_NAME \
  --name "MetaWebhookVerifyToken" \
  --value "TU_VERIFY_TOKEN_AQUI"

# Token de API de Meta por tenant (se crea en provisioning)
# az keyvault secret set --vault-name $KV_NAME --name "wa-token-XXXXXXXXXXX" --value "META_API_TOKEN"
```

## Paso 5: Registrar App en Entra ID

1. Ir a **Azure Portal → Entra ID → App Registrations → New Registration**
2. Nombre: `OpsControl AI`
3. Redirect URI: `https://TU_FRONTDOOR_ENDPOINT/auth/callback`
4. En **Expose an API**: añadir scope `Tenant.Manage`
5. En **App Roles**: crear `Platform.SuperAdmin`, `Tenant.Admin`, `Tenant.Viewer`
6. Copiar el **Client ID** y **Tenant ID** para usar en CI/CD

## Paso 6: Configurar GitHub Actions Secrets

En tu repo → Settings → Secrets and Variables → Actions:

| Secret | Descripción |
|---|---|
| `AZURE_CLIENT_ID` | Client ID del Service Principal creado por Bicep |
| `AZURE_TENANT_ID` | Tenant ID de tu directorio de Entra ID |
| `AZURE_SUBSCRIPTION_ID` | ID de tu suscripción de Azure |
| `ENTRA_CLIENT_ID` | Client ID de la app registration del dashboard |

## Paso 7: Primer Tenant

```bash
curl -X POST https://TU_APIM_URL/api/tenants \
  -H "Authorization: Bearer TU_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Mi Negocio SA de CV",
    "contactEmail": "contacto@minegocio.com",
    "phoneNumber": "+525512345678",
    "subscriptionTier": "basico",
    "whatsappPhoneNumberId": "META_PHONE_NUMBER_ID",
    "whatsappBusinessAccountId": "META_WABA_ID",
    "metaApiToken": "META_API_TOKEN"
  }'
```

## Variables de Entorno (Reference)

| Variable | Requerida | Descripción |
|---|---|---|
| `COSMOS_DB_ENDPOINT` | ✅ | URL del endpoint de Cosmos DB |
| `OPENAI_ENDPOINT` | ✅ | Endpoint de Azure OpenAI |
| `OPENAI_DEPLOYMENT_NAME` | ✅ | Nombre del deployment GPT-4o |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ | Token de verificación de Meta webhook |
| `STORAGE_ACCOUNT_NAME` | ✅ | Nombre del Storage Account |
| `KEY_VAULT_URI` | ✅ | URI del Key Vault |
| `ENTRA_TENANT_ID` | ✅ | Tenant ID de Entra ID para validar JWT |
| `JWT_AUDIENCE` | ✅ | `api://opscontrolai-backend` |

## Rollback

```bash
# Ver historial de deployments
az deployment group list --resource-group opscontrol-prod-rg

# Restaurar deployment anterior
az deployment group create \
  --resource-group opscontrol-prod-rg \
  --template-file infrastructure/main.bicep \
  --parameters infrastructure/parameters.prod.json
```
