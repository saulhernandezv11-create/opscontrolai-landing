// ============================================================
// storage.bicep – Azure Blob Storage for media files
// Hot tier for recent, Cool for 30+ days, delete after 90 days
// ============================================================

@description('Storage account name (3-24 lowercase alphanumeric)')
param storageAccountName string

@description('Location')
param location string

@description('Tags')
param tags object

@description('Key Vault name')
param keyVaultName string

@description('Log Analytics workspace ID')
param logAnalyticsWorkspaceId string

// ─── Storage Account ──────────────────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_GRS' // Geo-redundant for HA
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Allow' // Restrict further in prod with private endpoints
      bypass: 'AzureServices'
    }
  }
}

// ─── Blob Service ─────────────────────────────────────────────
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: ['https://admin.opscontrolai.com']
          allowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// ─── Media container (tenant media files) ────────────────────
resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'media'
  properties: {
    publicAccess: 'None'
  }
}

// ─── Static website container ($web) ─────────────────────────
resource webContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: '$web'
  properties: {
    publicAccess: 'None'
  }
}

// ─── Lifecycle Management ─────────────────────────────────────
resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'MoveToAccoolAfter30Days'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['media/']
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 30
                }
                delete: {
                  daysAfterModificationGreaterThan: 90
                }
              }
            }
          }
        }
      ]
    }
  }
}

// ─── Static website hosting ───────────────────────────────────
// Note: Can only be set via az CLI post-deployment; Bicep doesn't support it natively.
// Script in deploy.sh handles: az storage blob service-properties update --static-website

// ─── Diagnostic Settings ──────────────────────────────────────
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: blobService
  name: 'storage-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'StorageRead'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
      { category: 'StorageWrite'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
      { category: 'StorageDelete'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
  }
}

// ─── Store connection string in Key Vault ─────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

resource storageConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'StorageConnectionString'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output storageAccountName string = storageAccount.name
output staticWebsiteEndpoint string = replace(storageAccount.properties.primaryEndpoints.web, 'https://', '')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
