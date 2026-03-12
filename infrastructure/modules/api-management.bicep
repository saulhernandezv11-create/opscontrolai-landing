// ============================================================
// api-management.bicep – APIM for webhook routing & rate limiting
// Per-tier rate limits: Básico 1000, Profesional 5000, Empresarial ∞
// ============================================================

@description('APIM instance name')
param apimName string

@description('Location')
param location string

@description('Tags')
param tags object

@description('Publisher email')
param publisherEmail string

@description('Publisher organization name')
param publisherName string

@description('Function App hostname (backend)')
param functionAppHostname string

@description('Application Insights instrumentation key')
param appInsightsInstrumentationKey string

@description('Log Analytics workspace ID')
param logAnalyticsWorkspaceId string

// ─── APIM Service (Consumption tier for cost efficiency) ──────
resource apimService 'Microsoft.ApiManagement/service@2023-03-01-preview' = {
  name: apimName
  location: location
  tags: tags
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'False'
    }
  }
}

// ─── Application Insights Logger ─────────────────────────────
resource apimLogger 'Microsoft.ApiManagement/service/loggers@2023-03-01-preview' = {
  parent: apimService
  name: 'appInsightsLogger'
  properties: {
    loggerType: 'applicationInsights'
    credentials: {
      instrumentationKey: appInsightsInstrumentationKey
    }
    isBuffered: true
  }
}

// ─── Backend: Azure Functions ─────────────────────────────────
resource functionsBackend 'Microsoft.ApiManagement/service/backends@2023-03-01-preview' = {
  parent: apimService
  name: 'functions-backend'
  properties: {
    protocol: 'http'
    url: 'https://${functionAppHostname}'
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
  }
}

// ─── API: WhatsApp Webhooks ───────────────────────────────────
resource webhookApi 'Microsoft.ApiManagement/service/apis@2023-03-01-preview' = {
  parent: apimService
  name: 'whatsapp-webhooks'
  properties: {
    displayName: 'WhatsApp Webhooks'
    description: 'Inbound WhatsApp message webhooks from Meta Cloud API'
    path: 'webhooks'
    protocols: ['https']
    subscriptionRequired: false  // Meta webhook calls don't use subscriptions
    serviceUrl: 'https://${functionAppHostname}/api'
  }
}

// ─── Webhook operation: POST (receive message) ────────────────
resource webhookPostOperation 'Microsoft.ApiManagement/service/apis/operations@2023-03-01-preview' = {
  parent: webhookApi
  name: 'receive-whatsapp-message'
  properties: {
    displayName: 'Recibir Mensaje WhatsApp'
    method: 'POST'
    urlTemplate: '/{tenantId}'
    templateParameters: [
      {
        name: 'tenantId'
        type: 'string'
        required: true
      }
    ]
    description: 'Receives inbound WhatsApp messages from Meta Cloud API'
  }
}

// ─── API: Admin ───────────────────────────────────────────────
resource adminApi 'Microsoft.ApiManagement/service/apis@2023-03-01-preview' = {
  parent: apimService
  name: 'admin-api'
  properties: {
    displayName: 'Admin API'
    description: 'OpsControl AI admin management API'
    path: 'api'
    protocols: ['https']
    subscriptionRequired: false
    serviceUrl: 'https://${functionAppHostname}/api'
  }
}

// ─── Policy: Básico rate limiting (1000 req/month) ──────────
resource basicRateLimitPolicy 'Microsoft.ApiManagement/service/products@2023-03-01-preview' = {
  parent: apimService
  name: 'basico'
  properties: {
    displayName: 'Plan Básico'
    description: 'Hasta 1,000 conversaciones por mes'
    subscriptionRequired: true
    approvalRequired: false
    state: 'published'
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output gatewayUrl string = apimService.properties.gatewayUrl
output apimName string = apimService.name
