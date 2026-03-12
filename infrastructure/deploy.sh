#!/usr/bin/env bash
# deploy.sh – Deploy OpsControl AI WhatsApp Platform to Azure
# Usage: ./deploy.sh --env <dev|prod> --resource-group <rg-name>

set -euo pipefail

ENV=""
RESOURCE_GROUP=""

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift ;;
    --resource-group) RESOURCE_GROUP="$2"; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "$ENV" || -z "$RESOURCE_GROUP" ]]; then
  echo "Usage: ./deploy.sh --env <dev|prod> --resource-group <rg-name>"
  exit 1
fi

PARAMS_FILE="parameters.${ENV}.json"
LOCATION=$(jq -r '.parameters.location.value' "$PARAMS_FILE")

echo "🚀 Deploying OpsControl AI to $RESOURCE_GROUP ($ENV)..."

# ─── 1. Ensure resource group exists ─────────────────────────
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --tags \
  Environment="$ENV" Product=OpsControlAI ManagedBy=Bicep

# ─── 2. Deploy Bicep ─────────────────────────────────────────
echo "📦 Deploying Bicep templates..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infrastructure/main.bicep \
  --parameters "infrastructure/$PARAMS_FILE" \
  --output json)

STORAGE_ACCOUNT=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.storageAccountName.value')
FUNCTION_APP=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.functionAppName.value')

# ─── 3. Enable static website on storage ─────────────────────
echo "🌐 Enabling static website hosting..."
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document index.html \
  --404-document index.html

# ─── 4. Set cost alert ($10,000 MXN ≈ $550 USD) ─────────────
echo "💰 Creating cost alert..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az consumption budget create \
  --budget-name "opscontrol-${ENV}-budget" \
  --amount 550 \
  --category Cost \
  --time-grain Monthly \
  --start-date "$(date +%Y-%m-01)" \
  --end-date "2028-12-31" \
  --resource-group "$RESOURCE_GROUP" \
  --notifications '[{"enabled":true,"operator":"GreaterThan","threshold":80,"contactEmails":["saul.hernandezv11@gmail.com"],"thresholdType":"Actual"}]' \
  2>/dev/null || echo "Budget already exists, skipping."

# ─── 5. Build & deploy backend ───────────────────────────────
echo "⚙️  Building and deploying Azure Functions..."
cd backend
npm ci
npm run build
func azure functionapp publish "$FUNCTION_APP" --typescript
cd ..

# ─── 6. Build & deploy admin dashboard ───────────────────────
echo "🎨 Building and deploying admin dashboard..."
cd admin-dashboard
npm ci
VITE_API_BASE_URL="https://$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.apimGatewayUrl.value' | sed 's|https://||')" \
npm run build
az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT" \
  --destination '$web' \
  --source dist \
  --overwrite
cd ..

echo ""
echo "✅ Deployment complete!"
echo "   Admin Dashboard: https://$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.frontDoorEndpoint.value')"
echo "   API Gateway:     $(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.apimGatewayUrl.value')"
echo ""
echo "⚠️  Don't forget to set secret values in Key Vault:"
echo "   - MetaWebhookVerifyToken"
echo "   - (OpenAI and Cosmos DB keys are auto-populated by Bicep)"
