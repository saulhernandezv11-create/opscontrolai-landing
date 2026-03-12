// ============================================================
// key-vault.bicep – Azure Key Vault for secrets management
// Managed Identity RBAC for Function App access
// ============================================================

@description('Key Vault name (3-24 chars, globally unique)')
param keyVaultName string

@description('Location')
param location string

@description('Tags')
param tags object

@description('Log Analytics workspace ID')
param logAnalyticsWorkspaceId string

@description('Function App Managed Identity principal ID (optional, set after Function App creation)')
param functionAppPrincipalId string = ''

// ─── Key Vault ────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true  // Use RBAC instead of access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled' // Lock down with private endpoint in production
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ─── RBAC: Key Vault Secrets User role for Function App ──────
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6' // Built-in role ID

resource functionAppSecretsAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(functionAppPrincipalId)) {
  scope: keyVault
  name: guid(keyVault.id, functionAppPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Diagnostic Settings ──────────────────────────────────────
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: keyVault
  name: 'kv-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'AuditEvent'; enabled: true; retentionPolicy: { days: 90; enabled: true } }
    ]
    metrics: [
      { category: 'AllMetrics'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
  }
}

// ─── Placeholder secrets (to be set post-deployment) ─────────
resource metaVerifyTokenSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'MetaWebhookVerifyToken'
  properties: {
    value: 'REPLACE_WITH_YOUR_VERIFY_TOKEN' // Set via CI/CD secrets
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultId string = keyVault.id
