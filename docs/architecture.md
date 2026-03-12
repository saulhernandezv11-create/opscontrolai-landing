# Arquitectura del Sistema – OpsControl AI WhatsApp Platform

## Descripción General

OpsControl AI es una plataforma SaaS multi-tenant de automatización de WhatsApp, deployed 100% en Microsoft Azure. Diseñada para PyMEs mexicanas en CDMX y Texcoco.

## Diagrama de Flujo de Datos

```
Cliente WhatsApp
       │  POST mensaje
       ▼
Meta Cloud API (graph.facebook.com)
       │  POST /webhooks/{tenantId}
       ▼
Azure API Management (rate limiting por plan)
       │
       ▼
Azure Function: whatsapp-webhook (HTTP Trigger)
  1. Verifica firma X-Hub-Signature-256
  2. Resuelve tenant por phoneNumberId
  3. Encola en Azure Storage Queue
  4. Retorna 200 OK en <500ms
       │
       ▼ (async)
Azure Function: conversation-processor (Queue Trigger)
  1. Carga configuración del tenant (Cosmos DB)
  2. Detecta intención con GPT-4o
  3. Enruta: Flujo predefinido | Respuesta custom | GPT-4o fallback
  4. Envía respuesta via Meta Cloud API
  5. Persiste conversación en Cosmos DB
  6. Emite evento de analítica
       │
       ├── Azure Cosmos DB (NoSQL, multi-region)
       ├── Azure OpenAI (GPT-4o)
       ├── Azure Blob Storage (media)
       └── Azure Key Vault (secretos)
```

## Componentes Principales

| Componente | Tecnología | Propósito |
|---|---|---|
| Webhook ingress | Azure APIM + Functions | Recepción de mensajes Meta |
| Message processing | Azure Functions (Queue) | Orquestación AI/flows |
| AI engine | Azure OpenAI GPT-4o | NLU y generación de respuestas |
| Base de datos | Azure Cosmos DB | Datos multi-tenant particionados |
| Secretos | Azure Key Vault | API tokens, connection strings |
| Media | Azure Blob Storage | Imágenes, PDFs, audios |
| Dashboard | React 18 + Vite | UI de administración |
| CDN | Azure Front Door | Dashboard + API gateway público |
| Monitoreo | Application Insights | Logs, métricas, alertas |
| CI/CD | GitHub Actions | Deploy automatizado |

## Aislamiento Multi-Tenant

- **Cosmos DB**: Partition key `/tenantId` en todos los containers — garantiza que los datos de un tenant no puedan accederse desde otro
- **Blob Storage**: Container separado por tenant (`tenant-{tenantId}`)
- **Key Vault**: Secreto de API de WhatsApp por tenant (`wa-token-{tenantId}`)
- **Functions**: `tenantId` se propaga en todo el contexto de cada request

## Escalabilidad

- Azure Functions en plan Consumption → escala a 0 (bajo costo con pocos tenants)
- Cosmos DB con autoscale RU/s (400–4000) por container
- Azure APIM Consumption tier → pago por llamada
- En producción con 10+ tenants: considerar Functions Premium (warmup pre-allocado)

## Regiones

- **Primaria**: Mexico Central (`mexicocentral`)
- **Secundaria**: South Central US (`southcentralus`)
- Cosmos DB multi-region write habilitado para HA
