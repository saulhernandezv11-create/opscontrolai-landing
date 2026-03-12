// ============================================================
// cosmos-db.bicep – Cosmos DB Account with multi-region write
// Partition key strategy: /tenantId for all containers
// ============================================================

@description('Cosmos DB account name')
param accountName string

@description('Primary location')
param location string

@description('Secondary location for geo-replication')
param secondaryLocation string = 'southcentralus'

@description('Resource tags')
param tags object

@description('Key Vault name to store Cosmos DB connection string')
param keyVaultName string

@description('Log Analytics Workspace ID for diagnostics')
param logAnalyticsWorkspaceId string

// ─── Cosmos DB Account ────────────────────────────────────────
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
      {
        locationName: secondaryLocation
        failoverPriority: 1
        isZoneRedundant: false
      }
    ]
    enableMultipleWriteLocations: true
    enableAutomaticFailover: true
    publicNetworkAccess: 'Disabled'  // Private endpoint only
    networkAclBypass: 'AzureServices'
    ipRules: []
    capabilities: []
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
  }
}

// ─── Database ─────────────────────────────────────────────────
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: 'opscontrol'
  properties: {
    resource: {
      id: 'opscontrol'
    }
  }
}

// ─── Container: tenants ───────────────────────────────────────
resource tenantsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'tenants'
  properties: {
    resource: {
      id: 'tenants'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [{ path: '/"_etag"/?' }]
      }
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Container: conversations ─────────────────────────────────
resource conversationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'conversations'
  properties: {
    resource: {
      id: 'conversations'
      partitionKey: {
        paths: ['/tenantId']
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [{ path: '/"_etag"/?' }, { path: '/messages/*' }]
        compositeIndexes: [
          [
            { path: '/tenantId', order: 'ascending' }
            { path: '/metadata/lastMessageAt', order: 'descending' }
          ]
        ]
      }
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Container: contacts ──────────────────────────────────────
resource contactsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'contacts'
  properties: {
    resource: {
      id: 'contacts'
      partitionKey: {
        paths: ['/tenantId']
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [{ path: '/"_etag"/?' }]
        compositeIndexes: [
          [
            { path: '/tenantId', order: 'ascending' }
            { path: '/phoneNumber', order: 'ascending' }
          ]
        ]
      }
      uniqueKeyPolicy: {
        uniqueKeys: [
          { paths: ['/tenantId', '/phoneNumber'] }
        ]
      }
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Container: flows ─────────────────────────────────────────
resource flowsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'flows'
  properties: {
    resource: {
      id: 'flows'
      partitionKey: {
        paths: ['/tenantId']
        kind: 'Hash'
        version: 2
      }
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Container: analytics (TTL 90 days) ──────────────────────
resource analyticsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'analytics'
  properties: {
    resource: {
      id: 'analytics'
      partitionKey: {
        paths: ['/tenantId']
        kind: 'Hash'
        version: 2
      }
      defaultTtl: 7776000 // 90 days in seconds
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Container: analytics-daily ───────────────────────────────
resource analyticsDailyContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'analytics-daily'
  properties: {
    resource: {
      id: 'analytics-daily'
      partitionKey: {
        paths: ['/tenantId']
        kind: 'Hash'
        version: 2
      }
      autoscaleSettings: {
        maxThroughput: 4000
      }
    }
  }
}

// ─── Diagnostic Settings ──────────────────────────────────────
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: cosmosAccount
  name: 'cosmos-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'DataPlaneRequests'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
      { category: 'QueryRuntimeStatistics'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
    metrics: [
      { category: 'Requests'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
  }
}

// ─── Store connection string in Key Vault ─────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

resource cosmosConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'CosmosDbConnectionString'
  properties: {
    value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output endpoint string = cosmosAccount.properties.documentEndpoint
output accountName string = cosmosAccount.name
output databaseName string = database.name
