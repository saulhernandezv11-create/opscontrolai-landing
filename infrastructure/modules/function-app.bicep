// ============================================================
// function-app.bicep – Azure Functions consumption plan
// Managed Identity for Key Vault / Cosmos DB / Storage access
// ============================================================

@description('Azure Function App name')
param functionAppName string

@description('Existing storage account name for Functions runtime')
param storageAccountName string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Key Vault URI for secret references')
param keyVaultUri string

@description('Location')
param location string

@description('Tags')
param tags object

@description('Cosmos DB endpoint')
param cosmosDbEndpoint string

@description('Azure OpenAI endpoint')
param openAiEndpoint string

// ─── Reference existing storage account ───────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// ─── Service Plan (Consumption Y1) ───────────────────────────
resource hostingPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${functionAppName}-plan'
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: false // Windows (Node.js on Windows for Functions)
  }
}

// ─── Function App ─────────────────────────────────────────────
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        // Key Vault references for secrets
        {
          name: 'COSMOS_DB_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${split(keyVaultUri, '/')[2].split('.')[0]};SecretName=CosmosDbConnectionString)'
        }
        {
          name: 'COSMOS_DB_ENDPOINT'
          value: cosmosDbEndpoint
        }
        {
          name: 'OPENAI_ENDPOINT'
          value: openAiEndpoint
        }
        {
          name: 'OPENAI_API_KEY'
          value: '@Microsoft.KeyVault(VaultName=${split(keyVaultUri, '/')[2].split('.')[0]};SecretName=OpenAiApiKey)'
        }
        {
          name: 'META_WEBHOOK_VERIFY_TOKEN'
          value: '@Microsoft.KeyVault(VaultName=${split(keyVaultUri, '/')[2].split('.')[0]};SecretName=MetaWebhookVerifyToken)'
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVaultUri
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
      cors: {
        allowedOrigins: ['https://admin.opscontrolai.com', 'http://localhost:5173']
        supportCredentials: true
      }
    }
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output functionAppName string = functionApp.name
output defaultHostname string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
output functionAppId string = functionApp.id
