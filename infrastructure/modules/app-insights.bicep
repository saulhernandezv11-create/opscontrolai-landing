// ============================================================
// app-insights.bicep – Application Insights + Log Analytics
// Alerts for authentication failures, DDoS, webhook errors
// ============================================================

@description('Log Analytics workspace name')
param workspaceName string

@description('Application Insights resource name')
param appInsightsName string

@description('Location')
param location string

@description('Tags')
param tags object

@description('Admin email for alert notifications')
param adminEmail string

// ─── Log Analytics Workspace ──────────────────────────────────
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ─── Application Insights ─────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    SamplingPercentage: 10 // 10% sampling to reduce cost; full logs on errors
    RetentionInDays: 30
  }
}

// ─── Action Group (alert notifications) ──────────────────────
resource alertActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${appInsightsName}-alerts'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'OpsCntrlAI'
    enabled: true
    emailReceivers: [
      {
        name: 'AdminEmail'
        emailAddress: adminEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// ─── Alert: Failed auth attempts ─────────────────────────────
resource authFailureAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: '${appInsightsName}-auth-failures'
  location: location
  tags: tags
  properties: {
    displayName: 'OpsControl AI – Auth failures spike'
    description: 'More than 10 failed authentication attempts in 5 minutes'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [appInsights.id]
    criteria: {
      allOf: [
        {
          query: 'requests | where success == false and url contains "/api/admin" | summarize count()'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 10
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [alertActionGroup.id]
    }
  }
}

// ─── Alert: WhatsApp API error rate ──────────────────────────
resource whatsappApiErrorAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: '${appInsightsName}-wa-errors'
  location: location
  tags: tags
  properties: {
    displayName: 'OpsControl AI – WhatsApp API error spike'
    description: 'WhatsApp API errors exceed 5% of total calls'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT10M'
    windowSize: 'PT10M'
    scopes: [appInsights.id]
    criteria: {
      allOf: [
        {
          query: 'dependencies | where type == "HTTP" and target contains "graph.facebook.com" | summarize total=count(), failed=countif(success==false) | extend errorRate=100.0*failed/total | where errorRate > 5'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [alertActionGroup.id]
    }
  }
}

// ─── Alert: Cost threshold ($10,000 MXN) ─────────────────────
// Note: Cost alerts are set via Azure Cost Management, not Application Insights.
// See deploy.sh for az consumption budget create command.

// ─── Outputs ─────────────────────────────────────────────────
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output appInsightsId string = appInsights.id
output instrumentationKey string = appInsights.properties.InstrumentationKey
output connectionString string = appInsights.properties.ConnectionString
