// ============================================================
// front-door.bicep – Azure Front Door Standard for admin CDN
// Routes: /api/* → APIM, /* → Static website (admin dashboard)
// ============================================================

@description('Front Door profile name')
param profileName string

@description('Location (global)')
param location string = 'global'

@description('Tags')
param tags object

@description('Storage account static website endpoint (admin dashboard origin)')
param storageAccountWebEndpoint string

@description('APIM gateway URL (API origin)')
param apimGatewayUrl string

// ─── Front Door Profile (Standard tier) ──────────────────────
resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: profileName
  location: location
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

// ─── Origin Group: Admin Dashboard ───────────────────────────
resource adminDashboardOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: frontDoorProfile
  name: 'admin-dashboard-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

// ─── Origin: Storage static website ──────────────────────────
resource adminDashboardOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: adminDashboardOriginGroup
  name: 'storage-origin'
  properties: {
    hostName: storageAccountWebEndpoint
    httpPort: 80
    httpsPort: 443
    originHostHeader: storageAccountWebEndpoint
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

// ─── Origin Group: API ────────────────────────────────────────
resource apiOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: frontDoorProfile
  name: 'api-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/api/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

// ─── Origin: APIM ────────────────────────────────────────────
resource apiOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: apiOriginGroup
  name: 'apim-origin'
  properties: {
    hostName: replace(replace(apimGatewayUrl, 'https://', ''), '/', '')
    httpPort: 80
    httpsPort: 443
    originHostHeader: replace(replace(apimGatewayUrl, 'https://', ''), '/', '')
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

// ─── Endpoint ─────────────────────────────────────────────────
resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: frontDoorProfile
  name: 'opscontrol-endpoint'
  location: location
  properties: {
    enabledState: 'Enabled'
  }
}

// ─── Route: Admin Dashboard (catch-all) ──────────────────────
resource adminRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: frontDoorEndpoint
  name: 'admin-route'
  dependsOn: [adminDashboardOrigin]
  properties: {
    originGroup: {
      id: adminDashboardOriginGroup.id
    }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    cacheConfiguration: {
      queryStringCachingBehavior: 'IgnoreQueryString'
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: ['text/html', 'text/css', 'application/javascript', 'application/json']
      }
    }
  }
}

// ─── Route: API ───────────────────────────────────────────────
resource apiRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: frontDoorEndpoint
  name: 'api-route'
  dependsOn: [apiOrigin]
  properties: {
    originGroup: {
      id: apiOriginGroup.id
    }
    supportedProtocols: ['Https']
    patternsToMatch: ['/api/*', '/webhooks/*']
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    cacheConfiguration: {
      queryStringCachingBehavior: 'UseQueryString'
    }
  }
}

// ─── Outputs ─────────────────────────────────────────────────
output frontDoorEndpoint string = frontDoorEndpoint.properties.hostName
output frontDoorProfileId string = frontDoorProfile.id
