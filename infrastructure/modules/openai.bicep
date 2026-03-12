// ============================================================
// openai.bicep – Azure OpenAI Service with GPT-4o deployment
// ============================================================

@description('Azure OpenAI account name')
param openAiAccountName string

@description('Location – Azure OpenAI availability may vary')
param location string

@description('Tags')
param tags object

@description('GPT-4o deployment capacity (K TPM)')
param capacity int = 10

@description('Key Vault name to store API key')
param keyVaultName string

@description('Log Analytics workspace ID')
param logAnalyticsWorkspaceId string

// ─── Azure OpenAI Account ─────────────────────────────────────
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: openAiAccountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiAccountName
    publicNetworkAccess: 'Enabled' // Functions need access; use private endpoint in prod
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// ─── GPT-4o Deployment ────────────────────────────────────────
resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-05-01' = {
  parent: openAiAccount
  name: 'gpt-4o'
  sku: {
    name: 'Standard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-05-13'
    }
    raiPolicyName: 'Microsoft.Default' // Content filtering – hate/violence/self-harm
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// ─── Diagnostic Settings ──────────────────────────────────────
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: openAiAccount
  name: 'openai-diagnostics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'Audit'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
      { category: 'RequestResponse'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
    metrics: [
      { category: 'AllMetrics'; enabled: true; retentionPolicy: { days: 30; enabled: true } }
    ]
  }
}

// ─── Store API Key in Key Vault ───────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'OpenAiApiKey'
  properties: {
    value: openAiAccount.listKeys().key1
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output endpoint string = openAiAccount.properties.endpoint
output accountName string = openAiAccount.name
output deploymentName string = gpt4oDeployment.name
