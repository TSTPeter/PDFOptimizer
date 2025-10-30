# Deployment Guide

This guide provides detailed instructions for deploying the PDF JavaScript Optimizer to Azure.

## Prerequisites

Before you begin, ensure you have:

1. **Azure Subscription**: Active Azure subscription
2. **Azure CLI**: Installed and configured ([Installation Guide](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
3. **Node.js**: Version 20.x or higher
4. **Azure Functions Core Tools**: Version 4.x ([Installation Guide](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local))
5. **Git**: For version control

## Quick Start with Deployment Script

The fastest way to deploy is using the provided deployment script:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Log you into Azure (if needed)
2. Prompt for configuration values
3. Create all necessary Azure resources
4. Deploy the application

## Manual Deployment Steps

### Step 1: Prepare Your Environment

```bash
# Login to Azure
az login

# Set your subscription (if you have multiple)
az account set --subscription "Your Subscription Name"

# Verify your subscription
az account show
```

### Step 2: Define Variables

```bash
# Customize these values for your deployment
export RESOURCE_GROUP="pdf-optimizer-rg"
export LOCATION="eastus"
export STORAGE_ACCOUNT="pdfoptimizer$(openssl rand -hex 4)"
export FUNCTION_APP="pdf-optimizer-func-$(openssl rand -hex 4)"
export STATIC_WEB_APP="pdf-optimizer-web"
```

**Important**: Storage account and function app names must be globally unique across Azure.

### Step 3: Create Resource Group

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION
```

### Step 4: Create Storage Account

```bash
# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

# Get connection string
export CONNECTION_STRING=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString \
  --output tsv)

# Create blob container for PDFs
az storage container create \
  --name pdf-uploads \
  --account-name $STORAGE_ACCOUNT \
  --connection-string "$CONNECTION_STRING" \
  --public-access blob
```

### Step 5: Create Function App

```bash
# Create function app
az functionapp create \
  --resource-group $RESOURCE_GROUP \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name $FUNCTION_APP \
  --storage-account $STORAGE_ACCOUNT \
  --os-type Linux

# Configure application settings
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    "AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING" \
    "BLOB_CONTAINER_NAME=pdf-uploads" \
    "WEBSITE_NODE_DEFAULT_VERSION=~20"

# Enable CORS (adjust for production)
az functionapp cors add \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins "*"

# Note: For production, replace "*" with your actual domain
```

### Step 6: Build and Deploy Functions

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to Azure Functions
func azure functionapp publish $FUNCTION_APP --typescript
```

### Step 7: Deploy Frontend

You have two options for hosting the frontend:

#### Option A: Azure Static Web Apps (Recommended)

```bash
# Create static web app
az staticwebapp create \
  --name $STATIC_WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --source https://github.com/your-org/your-repo \
  --branch main \
  --app-location "/public" \
  --api-location "" \
  --output-location ""

# Get the URL
az staticwebapp show \
  --name $STATIC_WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" \
  --output tsv
```

Then update `public/app.js`:
```javascript
const API_BASE_URL = 'https://YOUR_FUNCTION_APP.azurewebsites.net/api';
```

#### Option B: Blob Storage Static Website

```bash
# Enable static website hosting
az storage blob service-properties update \
  --account-name $STORAGE_ACCOUNT \
  --static-website \
  --index-document index.html \
  --404-document index.html

# Update app.js with your Function App URL
sed -i "s|window.location.origin + '/api'|'https://$FUNCTION_APP.azurewebsites.net/api'|g" public/app.js

# Upload files
az storage blob upload-batch \
  --account-name $STORAGE_ACCOUNT \
  --destination '$web' \
  --source ./public

# Get the static website URL
az storage account show \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query "primaryEndpoints.web" \
  --output tsv
```

### Step 8: Configure CORS for Production

```bash
# Remove wildcard CORS
az functionapp cors remove \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins "*"

# Add your specific domain
az functionapp cors add \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --allowed-origins "https://your-static-website-url.azurestaticapps.net"
```

### Step 9: Verify Deployment

```bash
# Check function app status
az functionapp show \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --query "state" \
  --output tsv

# List function endpoints
func azure functionapp list-functions $FUNCTION_APP

# Test the API
curl https://$FUNCTION_APP.azurewebsites.net/api/uploadAnalyze \
  -X POST \
  -F "file=@test.pdf"
```

## Azure DevOps Pipeline Deployment

If you're using Azure DevOps:

1. Create a new pipeline
2. Use the provided `azure-deploy.yml` file
3. Configure the following pipeline variables:
   - `azureSubscription`: Your Azure service connection
   - `functionAppName`: Your function app name
   - `storageAccountName`: Your storage account name

4. Run the pipeline

## GitHub Actions Deployment

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Deploy to Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: ${{ secrets.AZURE_FUNCTION_APP_NAME }}
          package: .
          publish-profile: ${{ secrets.AZURE_FUNCTION_APP_PUBLISH_PROFILE }}

      - name: Deploy frontend to Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/public"
```

Configure these GitHub secrets:
- `AZURE_FUNCTION_APP_NAME`
- `AZURE_FUNCTION_APP_PUBLISH_PROFILE`
- `AZURE_STATIC_WEB_APPS_API_TOKEN`

## Post-Deployment Configuration

### 1. Enable Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app pdf-optimizer-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP

# Get instrumentation key
INSIGHTS_KEY=$(az monitor app-insights component show \
  --app pdf-optimizer-insights \
  --resource-group $RESOURCE_GROUP \
  --query "instrumentationKey" \
  --output tsv)

# Configure function app
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings "APPINSIGHTS_INSTRUMENTATIONKEY=$INSIGHTS_KEY"
```

### 2. Set Up Custom Domain (Optional)

```bash
# For Function App
az functionapp config hostname add \
  --webapp-name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --hostname api.yourdomain.com

# For Static Web App
az staticwebapp hostname set \
  --name $STATIC_WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --hostname www.yourdomain.com
```

### 3. Enable Authentication (Recommended for Production)

```bash
# Enable Azure AD authentication
az functionapp auth update \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --enabled true \
  --action LoginWithAzureActiveDirectory \
  --aad-client-id YOUR_APP_CLIENT_ID
```

### 4. Configure Automatic Cleanup

Add a timer-triggered function for cleanup:

```typescript
// src/functions/cleanup.ts
import { app, InvocationContext, Timer } from '@azure/functions';
import { StorageHelper } from '../utils/storageHelper';

export async function cleanup(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log('Running cleanup...');

  const storageHelper = new StorageHelper(
    process.env.AZURE_STORAGE_CONNECTION_STRING!,
    process.env.BLOB_CONTAINER_NAME!
  );

  // Delete files older than 24 hours
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  // Implement cleanup logic

  context.log('Cleanup complete');
}

app.timer('cleanup', {
  schedule: '0 0 */6 * * *', // Every 6 hours
  handler: cleanup
});
```

## Monitoring and Troubleshooting

### View Logs

```bash
# Stream function app logs
az webapp log tail \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP

# Or use Azure Portal:
# Navigate to Function App → Monitor → Log stream
```

### Check Metrics

```bash
# View function executions
az monitor metrics list \
  --resource $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --resource-type "Microsoft.Web/sites" \
  --metric "FunctionExecutionCount"
```

### Common Issues

**Issue**: Function app deployment fails
- Check Node.js version matches Azure configuration
- Ensure all dependencies are in `package.json`
- Verify build succeeds locally

**Issue**: CORS errors
- Check CORS configuration on function app
- Ensure frontend URL is allowed
- Verify API URL in `app.js`

**Issue**: File upload fails
- Check storage connection string
- Verify blob container exists
- Check storage account access permissions

## Scaling Considerations

### Consumption Plan (Default)
- Automatic scaling
- Pay per execution
- Best for variable workloads

### Premium Plan (For Higher Load)
```bash
az functionapp plan create \
  --name pdf-optimizer-premium \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku EP1 \
  --is-linux

az functionapp create \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --plan pdf-optimizer-premium \
  --runtime node \
  --runtime-version 20
```

## Cost Optimization

1. **Use Consumption Plan**: Start with consumption, upgrade if needed
2. **Enable Blob Lifecycle Management**: Auto-delete old files
3. **Configure Auto-shutdown**: For dev/test environments
4. **Monitor Usage**: Use Azure Cost Management
5. **Optimize Function Execution Time**: Smaller PDFs = lower costs

## Backup and Disaster Recovery

```bash
# Enable backup (Premium/App Service Plan only)
az webapp config backup create \
  --resource-group $RESOURCE_GROUP \
  --webapp-name $FUNCTION_APP \
  --container-url "https://$STORAGE_ACCOUNT.blob.core.windows.net/backups?[SAS_TOKEN]" \
  --backup-name initial-backup

# Export ARM template
az group export \
  --name $RESOURCE_GROUP \
  --output json > deployment-template.json
```

## Security Hardening

1. **Restrict network access**:
```bash
az functionapp config access-restriction add \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --rule-name AllowMyIP \
  --action Allow \
  --ip-address YOUR_IP_ADDRESS
```

2. **Enable Managed Identity**:
```bash
az functionapp identity assign \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP
```

3. **Use Key Vault for secrets**:
```bash
az keyvault create \
  --name pdf-optimizer-kv \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

## Rollback Procedure

If you need to rollback:

```bash
# List deployment slots
az functionapp deployment list \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP

# Swap to previous slot
az functionapp deployment slot swap \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --slot staging \
  --target-slot production
```

## Support and Resources

- [Azure Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/)
- [Azure Static Web Apps Documentation](https://docs.microsoft.com/en-us/azure/static-web-apps/)
- [Azure Storage Documentation](https://docs.microsoft.com/en-us/azure/storage/)
