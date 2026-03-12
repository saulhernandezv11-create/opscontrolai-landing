// ============================================================
// main.bicep – OpsControl AI WhatsApp Platform
// Orchestrates all infrastructure modules
// ============================================================

targetScope = 'resourceGroup'

// ─── Parameters ──────────────────────────────────────────────
@description('Deployment environment (dev, prod)')
@allowed(['dev', 'prod'])
param environment string = 'dev'

@description('Azure region for primary deployment')
param location string = resourceGroup().location

@description('Secondary region for geo-replication (Cosmos DB)')
param secondaryLocation string = 'southcentralus'

@description('Unique suffix appended to resource names for global uniqueness')
param resourceSuffix string = uniqueString(resourceGroup().id)

@description('Admin email address for alerts and notifications')
param adminEmail string

@description('Azure OpenAI GPT-4o model deployment capacity (thousands of tokens per minute)')
param openAiCapacity int = 10

@description('Tags applied to every resource for cost allocation')
param commonTags object = {
  Environment: environment
  Product: 'OpsControlAI'
  CostCenter: 'opscontrol'
  ManagedBy: 'Bicep'
}

// ─── Variables ────────────────────────────────────────────────
var prefix = 'opsctrl'
var envSuffix = '${environment}-${take(resourceSuffix, 6)}'

// ─── Module: Application Insights ────────────────────────────
module appInsights 'modules/app-insights.bicep' = {
  name: 'appInsightsDeploy'
  params: {
    workspaceName: '${prefix}-law-${envSuffix}'
    appInsightsName: '${prefix}-ai-${envSuffix}'
    location: location
    tags: commonTags
    adminEmail: adminEmail
  }
}

// ─── Module: Key Vault ────────────────────────────────────────
module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVaultDeploy'
  params: {
    keyVaultName: '${prefix}-kv-${envSuffix}'
    location: location
    tags: commonTags
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

// ─── Module: Cosmos DB ────────────────────────────────────────
module cosmosDb 'modules/cosmos-db.bicep' = {
  name: 'cosmosDbDeploy'
  params: {
    accountName: '${prefix}-cosmos-${envSuffix}'
    location: location
    secondaryLocation: secondaryLocation
    tags: commonTags
    keyVaultName: keyVault.outputs.keyVaultName
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

// ─── Module: Storage ─────────────────────────────────────────
module storage 'modules/storage.bicep' = {
  name: 'storageDeploy'
  params: {
    storageAccountName: '${prefix}stor${take(resourceSuffix, 8)}'
    location: location
    tags: commonTags
    keyVaultName: keyVault.outputs.keyVaultName
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

// ─── Module: Azure OpenAI ─────────────────────────────────────
module openAi 'modules/openai.bicep' = {
  name: 'openAiDeploy'
  params: {
    openAiAccountName: '${prefix}-oai-${envSuffix}'
    location: location
    tags: commonTags
    capacity: openAiCapacity
    keyVaultName: keyVault.outputs.keyVaultName
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

// ─── Module: Azure Functions (Backend) ───────────────────────
module functionApp 'modules/function-app.bicep' = {
  name: 'functionAppDeploy'
  params: {
    functionAppName: '${prefix}-func-${envSuffix}'
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: appInsights.outputs.connectionString
    keyVaultUri: keyVault.outputs.keyVaultUri
    location: location
    tags: commonTags
    cosmosDbEndpoint: cosmosDb.outputs.endpoint
    openAiEndpoint: openAi.outputs.endpoint
  }
}

// ─── Grant Function App Managed Identity access to Key Vault ─
module keyVaultAccess 'modules/key-vault.bicep' = {
  name: 'keyVaultAccessDeploy'
  params: {
    keyVaultName: keyVault.outputs.keyVaultName
    location: location
    tags: commonTags
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
    functionAppPrincipalId: functionApp.outputs.principalId
  }
}

// ─── Module: API Management ───────────────────────────────────
module apiManagement 'modules/api-management.bicep' = {
  name: 'apimDeploy'
  params: {
    apimName: '${prefix}-apim-${envSuffix}'
    location: location
    tags: commonTags
    publisherEmail: adminEmail
    publisherName: 'OpsControl AI'
    functionAppHostname: functionApp.outputs.defaultHostname
    appInsightsInstrumentationKey: appInsights.outputs.instrumentationKey
    logAnalyticsWorkspaceId: appInsights.outputs.logAnalyticsWorkspaceId
  }
}

// ─── Module: Azure Front Door ─────────────────────────────────
module frontDoor 'modules/front-door.bicep' = {
  name: 'frontDoorDeploy'
  params: {
    profileName: '${prefix}-afd-${envSuffix}'
    location: 'global'
    tags: commonTags
    storageAccountWebEndpoint: storage.outputs.staticWebsiteEndpoint
    apimGatewayUrl: apiManagement.outputs.gatewayUrl
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output functionAppName string = functionApp.outputs.functionAppName
output functionAppDefaultHostname string = functionApp.outputs.defaultHostname
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output openAiEndpoint string = openAi.outputs.endpoint
output keyVaultUri string = keyVault.outputs.keyVaultUri
output apimGatewayUrl string = apiManagement.outputs.gatewayUrl
output frontDoorEndpoint string = frontDoor.outputs.frontDoorEndpoint
output storageAccountName string = storage.outputs.storageAccountName
output appInsightsConnectionString string = appInsights.outputs.connectionString
