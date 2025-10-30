# Step-by-Step Azure Deployment Guide for Windows PowerShell 7

This guide will walk you through deploying the PDF JavaScript Optimizer to Azure from scratch, using PowerShell 7 on Windows.

## Phase 1: Install Prerequisites

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download the **LTS version** (20.x or higher)
3. Run the installer with default options
4. Open a **new** PowerShell window and verify:

```powershell
node --version
# Should show v20.x.x or higher

npm --version
# Should show 10.x.x or higher
```

### Step 2: Install Azure CLI

1. Download the Azure CLI installer:
   - Go to: https://aka.ms/installazurecliwindows
   - Click "Download" for Windows
   - Run the MSI installer

2. **Close and reopen PowerShell** after installation

3. Verify installation:

```powershell
az --version
# Should show azure-cli version 2.x.x
```

### Step 3: Install Azure Functions Core Tools

```powershell
# Using npm (recommended for Windows)
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

Wait for installation to complete (may take a few minutes), then verify:

```powershell
func --version
# Should show 4.x.x
```

### Step 4: Install Project Dependencies

Navigate to your project folder and install dependencies:

```powershell
# Navigate to the project (adjust path as needed)
cd C:\Path\To\PDFOptimizer

# Install dependencies
npm install
```

This will take a few minutes to download all packages.

---

## Phase 2: Set Up Azure Account

### Step 5: Sign In to Azure

```powershell
# Sign in to Azure
az login
```

This will:
1. Open your web browser
2. Ask you to sign in with your Microsoft account
3. Show "You have logged in" when successful
4. Return account information in PowerShell

If you have **multiple Azure subscriptions**, list them:

```powershell
az account list --output table
```

Set the subscription you want to use:

```powershell
az account set --subscription "Your Subscription Name"
```

Verify your current subscription:

```powershell
az account show --output table
```

---

## Phase 3: Create Azure Resources

### Step 6: Choose Your Configuration

First, let's set up some variables. **Choose unique names** (no spaces, lowercase letters and numbers only):

```powershell
# CUSTOMIZE THESE VALUES:
$RESOURCE_GROUP = "pdf-optimizer-rg"
$LOCATION = "eastus"  # Or: westus, westeurope, etc.
$STORAGE_ACCOUNT = "pdfstore$(Get-Random -Maximum 9999)"  # Must be globally unique
$FUNCTION_APP = "pdf-optimizer-$(Get-Random -Maximum 9999)"  # Must be globally unique

# Display your configuration
Write-Host "Resource Group: $RESOURCE_GROUP"
Write-Host "Location: $LOCATION"
Write-Host "Storage Account: $STORAGE_ACCOUNT"
Write-Host "Function App: $FUNCTION_APP"
```

**Note**: Storage account names must be:
- 3-24 characters
- Only lowercase letters and numbers
- Globally unique across all of Azure

### Step 7: Create Resource Group

A resource group is a container for all your Azure resources.

```powershell
az group create --name $RESOURCE_GROUP --location $LOCATION
```

You should see output showing the resource group was created with `"provisioningState": "Succeeded"`.

### Step 8: Create Storage Account

```powershell
az storage account create `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2
```

This takes 30-60 seconds. Wait for completion.

### Step 9: Get Storage Connection String

```powershell
$CONNECTION_STRING = az storage account show-connection-string `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --query connectionString `
  --output tsv

# Verify it worked (should show a long connection string)
Write-Host "Connection String: $CONNECTION_STRING"
```

### Step 10: Create Blob Container

```powershell
az storage container create `
  --name "pdf-uploads" `
  --account-name $STORAGE_ACCOUNT `
  --connection-string $CONNECTION_STRING `
  --public-access blob
```

### Step 11: Create Function App

```powershell
az functionapp create `
  --resource-group $RESOURCE_GROUP `
  --consumption-plan-location $LOCATION `
  --runtime node `
  --runtime-version 20 `
  --functions-version 4 `
  --name $FUNCTION_APP `
  --storage-account $STORAGE_ACCOUNT `
  --os-type Windows
```

This takes 1-2 minutes. Wait for completion.

### Step 12: Configure Function App Settings

```powershell
az functionapp config appsettings set `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --settings `
    "AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING" `
    "BLOB_CONTAINER_NAME=pdf-uploads" `
    "WEBSITE_NODE_DEFAULT_VERSION=~20"
```

### Step 13: Enable CORS

CORS allows your website to call the API:

```powershell
az functionapp cors add `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --allowed-origins "*"
```

**Note**: For production, you should replace "*" with your actual website URL.

---

## Phase 4: Deploy Your Code

### Step 14: Build the TypeScript Code

```powershell
# Make sure you're in the project directory
cd C:\Path\To\PDFOptimizer

# Build the TypeScript files
npm run build
```

This compiles your TypeScript code to JavaScript in the `dist` folder.

### Step 15: Deploy to Azure Functions

```powershell
func azure functionapp publish $FUNCTION_APP
```

This will:
1. Package your code
2. Upload to Azure
3. Install npm packages on Azure
4. Deploy the functions

**This takes 2-5 minutes**. You'll see progress updates.

When complete, you'll see:
```
Functions in [your-function-app]:
    convertPDF - [POST] Invoke url: https://[your-function-app].azurewebsites.net/api/convertPDF
    downloadPDF - [GET] Invoke url: https://[your-function-app].azurewebsites.net/api/downloadPDF
    uploadAnalyze - [POST] Invoke url: https://[your-function-app].azurewebsites.net/api/uploadAnalyze
```

**Copy these URLs** - you'll need them!

### Step 16: Test Your Function App

Let's verify the functions are running:

```powershell
# Test health endpoint (if you add one) or just check the function app status
az functionapp show `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --query "state" `
  --output tsv
```

Should show: `Running`

---

## Phase 5: Deploy the Frontend

You have two options for hosting the frontend:

### Option A: Azure Static Web Apps (Recommended - Free Tier Available)

#### Step 17a: Update Frontend Configuration

First, update the API URL in your frontend:

```powershell
# Get your Function App URL
$FUNCTION_URL = "https://$FUNCTION_APP.azurewebsites.net/api"

Write-Host "Your Function App URL is: $FUNCTION_URL"
Write-Host ""
Write-Host "Open public/app.js and update line 2 to:"
Write-Host "const API_BASE_URL = '$FUNCTION_URL';"
```

**Manually edit** `public/app.js`:
1. Open `public/app.js` in your text editor
2. Find line 2: `const API_BASE_URL = window.location.origin + '/api';`
3. Replace it with: `const API_BASE_URL = 'https://YOUR-FUNCTION-APP.azurewebsites.net/api';`
4. Save the file

#### Step 17b: Create Static Web App

Install the Static Web Apps CLI:

```powershell
npm install -g @azure/static-web-apps-cli
```

Create the Static Web App:

```powershell
$STATIC_WEB_APP = "pdf-optimizer-web-$(Get-Random -Maximum 9999)"

az staticwebapp create `
  --name $STATIC_WEB_APP `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Free
```

#### Step 17c: Get Deployment Token

```powershell
$DEPLOYMENT_TOKEN = az staticwebapp secrets list `
  --name $STATIC_WEB_APP `
  --resource-group $RESOURCE_GROUP `
  --query "properties.apiKey" `
  --output tsv

Write-Host "Deployment Token: $DEPLOYMENT_TOKEN"
```

#### Step 17d: Deploy Frontend

```powershell
swa deploy ./public `
  --deployment-token $DEPLOYMENT_TOKEN `
  --app-location "./public"
```

#### Step 17e: Get Your Website URL

```powershell
$WEBSITE_URL = az staticwebapp show `
  --name $STATIC_WEB_APP `
  --resource-group $RESOURCE_GROUP `
  --query "defaultHostname" `
  --output tsv

Write-Host ""
Write-Host "================================================"
Write-Host "Your website is live at: https://$WEBSITE_URL"
Write-Host "================================================"
```

### Option B: Azure Blob Storage Static Website (Alternative)

If you prefer using blob storage instead:

#### Step 17b-alt: Enable Static Website

```powershell
az storage blob service-properties update `
  --account-name $STORAGE_ACCOUNT `
  --static-website `
  --index-document index.html `
  --404-document index.html
```

#### Step 17c-alt: Update Frontend Configuration

Update `public/app.js` as described in Step 17a above.

#### Step 17d-alt: Upload Files

```powershell
az storage blob upload-batch `
  --account-name $STORAGE_ACCOUNT `
  --destination '$web' `
  --source ./public
```

#### Step 17e-alt: Get Website URL

```powershell
$WEBSITE_URL = az storage account show `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --query "primaryEndpoints.web" `
  --output tsv

Write-Host ""
Write-Host "================================================"
Write-Host "Your website is live at: $WEBSITE_URL"
Write-Host "================================================"
```

---

## Phase 6: Configure Production CORS (Important!)

Once you know your website URL, update CORS to be more secure:

```powershell
# Replace YOUR-WEBSITE-URL with your actual URL
$YOUR_WEBSITE_URL = "https://your-actual-website-url.azurestaticapps.net"

# Remove wildcard
az functionapp cors remove `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --allowed-origins "*"

# Add your specific URL
az functionapp cors add `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --allowed-origins $YOUR_WEBSITE_URL
```

---

## Phase 7: Test Your Application

### Step 18: Open Your Website

```powershell
# Open your website in the default browser
Start-Process $WEBSITE_URL
```

### Step 19: Test the Application

1. **Upload a test PDF** (create a simple PDF with links if you don't have an InDesign PDF)
2. **Check if analysis works** - you should see results
3. **Try converting** - should generate a new PDF
4. **Download the result** - verify the file downloads

---

## Troubleshooting

### If Upload Fails

Check function app logs:

```powershell
az webapp log tail `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP
```

Press `Ctrl+C` to stop viewing logs.

### If Functions Don't Show Results

Check function app status:

```powershell
az functionapp show `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --query "{name:name, state:state, hostNames:defaultHostName}"
```

### If CORS Errors Occur

Verify CORS settings:

```powershell
az functionapp cors show `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP
```

### View All Your Resources

```powershell
az resource list `
  --resource-group $RESOURCE_GROUP `
  --output table
```

---

## Useful Commands for Later

### View Function App Logs

```powershell
az webapp log tail --name $FUNCTION_APP --resource-group $RESOURCE_GROUP
```

### Redeploy Functions (after making changes)

```powershell
npm run build
func azure functionapp publish $FUNCTION_APP
```

### Redeploy Frontend (Static Web Apps)

```powershell
swa deploy ./public --deployment-token $DEPLOYMENT_TOKEN --app-location "./public"
```

### Redeploy Frontend (Blob Storage)

```powershell
az storage blob upload-batch --account-name $STORAGE_ACCOUNT --destination '$web' --source ./public
```

### Check Costs

```powershell
# Install cost management extension (first time only)
az extension add --name costmanagement

# View costs for this month
az costmanagement query `
  --type Usage `
  --scope "/subscriptions/$(az account show --query id -o tsv)" `
  --timeframe MonthToDate `
  --dataset-grouping name="ResourceGroup" type="Dimension"
```

---

## Complete Script Summary

Here's a complete script you can save and run (after customizing the variables):

```powershell
# ============================================
# PDF Optimizer - Complete Deployment Script
# ============================================

# STEP 1: Configure these variables
$RESOURCE_GROUP = "pdf-optimizer-rg"
$LOCATION = "eastus"
$STORAGE_ACCOUNT = "pdfstore$(Get-Random -Maximum 9999)"
$FUNCTION_APP = "pdf-optimizer-$(Get-Random -Maximum 9999)"

Write-Host "Starting deployment with configuration:"
Write-Host "  Resource Group: $RESOURCE_GROUP"
Write-Host "  Location: $LOCATION"
Write-Host "  Storage Account: $STORAGE_ACCOUNT"
Write-Host "  Function App: $FUNCTION_APP"
Write-Host ""

# STEP 2: Create resources
Write-Host "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

Write-Host "Creating storage account..."
az storage account create `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2

Write-Host "Getting connection string..."
$CONNECTION_STRING = az storage account show-connection-string `
  --name $STORAGE_ACCOUNT `
  --resource-group $RESOURCE_GROUP `
  --query connectionString `
  --output tsv

Write-Host "Creating blob container..."
az storage container create `
  --name "pdf-uploads" `
  --account-name $STORAGE_ACCOUNT `
  --connection-string $CONNECTION_STRING `
  --public-access blob

Write-Host "Creating function app..."
az functionapp create `
  --resource-group $RESOURCE_GROUP `
  --consumption-plan-location $LOCATION `
  --runtime node `
  --runtime-version 20 `
  --functions-version 4 `
  --name $FUNCTION_APP `
  --storage-account $STORAGE_ACCOUNT `
  --os-type Windows

Write-Host "Configuring function app..."
az functionapp config appsettings set `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --settings `
    "AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING" `
    "BLOB_CONTAINER_NAME=pdf-uploads" `
    "WEBSITE_NODE_DEFAULT_VERSION=~20"

Write-Host "Enabling CORS..."
az functionapp cors add `
  --name $FUNCTION_APP `
  --resource-group $RESOURCE_GROUP `
  --allowed-origins "*"

# STEP 3: Deploy code
Write-Host "Building TypeScript..."
npm run build

Write-Host "Deploying functions..."
func azure functionapp publish $FUNCTION_APP

Write-Host ""
Write-Host "================================================"
Write-Host "Deployment Complete!"
Write-Host "================================================"
Write-Host ""
Write-Host "Function App URL: https://$FUNCTION_APP.azurewebsites.net"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update public/app.js with the Function App URL"
Write-Host "2. Deploy the frontend using Static Web Apps or Blob Storage"
Write-Host "3. Test your application!"
```

Save this as `deploy.ps1` and run it with:

```powershell
.\deploy.ps1
```

---

## Need Help?

If you run into issues:

1. **Check Azure Portal**: https://portal.azure.com
   - Look for your resource group
   - Click on Function App to view logs and status

2. **View logs in real-time**:
   ```powershell
   az webapp log tail --name $FUNCTION_APP --resource-group $RESOURCE_GROUP
   ```

3. **Common issues**:
   - **"Name already exists"**: Choose a different name (storage/function app must be globally unique)
   - **CORS errors**: Make sure CORS is enabled and your website URL is allowed
   - **Upload fails**: Check storage connection string is set correctly

4. **Delete everything and start over** (if needed):
   ```powershell
   az group delete --name $RESOURCE_GROUP --yes
   ```
   Warning: This deletes ALL resources in the resource group!

---

Good luck with your deployment! Take it one step at a time.
