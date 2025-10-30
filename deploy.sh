#!/bin/bash

# PDF Optimizer Deployment Script
# This script helps deploy the application to Azure

set -e

echo "PDF Optimizer - Azure Deployment Script"
echo "========================================"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "Error: Azure CLI is not installed."
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo "Please log in to Azure..."
    az login
fi

# Configuration
read -p "Enter Resource Group name: " RESOURCE_GROUP
read -p "Enter Function App name: " FUNCTION_APP_NAME
read -p "Enter Storage Account name: " STORAGE_ACCOUNT_NAME
read -p "Enter Azure region (e.g., eastus): " LOCATION

echo ""
echo "Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Function App: $FUNCTION_APP_NAME"
echo "  Storage Account: $STORAGE_ACCOUNT_NAME"
echo "  Location: $LOCATION"
echo ""
read -p "Continue with deployment? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Create resource group
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create storage account
echo "Creating storage account..."
az storage account create \
    --name $STORAGE_ACCOUNT_NAME \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --sku Standard_LRS

# Get storage connection string
echo "Getting storage connection string..."
STORAGE_CONNECTION_STRING=$(az storage account show-connection-string \
    --name $STORAGE_ACCOUNT_NAME \
    --resource-group $RESOURCE_GROUP \
    --query connectionString \
    --output tsv)

# Create blob container
echo "Creating blob container..."
az storage container create \
    --name pdf-uploads \
    --account-name $STORAGE_ACCOUNT_NAME \
    --connection-string "$STORAGE_CONNECTION_STRING" \
    --public-access blob

# Create function app
echo "Creating function app..."
az functionapp create \
    --resource-group $RESOURCE_GROUP \
    --consumption-plan-location $LOCATION \
    --runtime node \
    --runtime-version 20 \
    --functions-version 4 \
    --name $FUNCTION_APP_NAME \
    --storage-account $STORAGE_ACCOUNT_NAME

# Configure function app settings
echo "Configuring function app settings..."
az functionapp config appsettings set \
    --name $FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
    "AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONNECTION_STRING" \
    "BLOB_CONTAINER_NAME=pdf-uploads"

# Enable CORS
echo "Enabling CORS..."
az functionapp cors add \
    --name $FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --allowed-origins "*"

# Build the application
echo "Building application..."
npm install
npm run build

# Deploy the application
echo "Deploying application..."
func azure functionapp publish $FUNCTION_APP_NAME

echo ""
echo "Deployment complete!"
echo "Function App URL: https://$FUNCTION_APP_NAME.azurewebsites.net"
echo ""
echo "Next steps:"
echo "1. Update the API_BASE_URL in public/app.js to point to your Function App"
echo "2. Deploy the static files in the 'public' folder to Azure Static Web Apps or Azure Blob Storage"
