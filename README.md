# PDF JavaScript Optimizer for SharePoint

An Azure-hosted web application that analyzes PDF files exported from Adobe InDesign, identifies JavaScript elements, and converts them to SharePoint-compatible formats.

## Overview

This tool helps teams who create interactive PDFs with JavaScript in Adobe InDesign make those PDFs compatible with SharePoint's viewer, which doesn't support JavaScript. The application:

1. Analyzes uploaded PDFs to identify JavaScript elements
2. Categorizes elements by type (navigation, popups, mouse events, etc.)
3. Identifies which elements can be converted to standard hyperlinks
4. Allows users to review and customize conversions
5. Generates a SharePoint-compatible PDF with preserved functionality where possible
6. Maintains all external hyperlinks

## Features

### Analysis Capabilities
- **JavaScript Detection**: Identifies all JavaScript actions in the PDF
- **Element Categorization**: Classifies elements as navigation, popup, mouseover, form, or other
- **Conversion Assessment**: Determines which elements can be converted to hyperlinks
- **External Link Preservation**: Maintains all existing external hyperlinks
- **Page-by-page Analysis**: Shows exactly where JavaScript elements are located

### Conversion Options
- **Smart Conversion**: Converts navigation JavaScript to internal page links
- **URL Preservation**: Maintains external URLs when converting JavaScript
- **Selective Removal**: Remove incompatible elements (popups, mouse events)
- **Custom Targeting**: Manually specify target pages for navigation elements
- **Batch Processing**: Handle multiple elements at once

### User Interface
- **Drag-and-drop Upload**: Easy file selection
- **Visual Analysis**: Clear presentation of findings
- **Interactive Review**: Customize each element's handling
- **Progress Tracking**: See what's being converted or removed
- **One-click Download**: Get your optimized PDF instantly

## Architecture

### Backend (Azure Functions)
- **Language**: TypeScript/Node.js
- **Runtime**: Azure Functions v4
- **Libraries**:
  - `pdf-lib`: PDF manipulation
  - `@azure/storage-blob`: File storage
  - `@azure/functions`: Azure Functions runtime

### Frontend
- **Stack**: Vanilla HTML/CSS/JavaScript
- **Hosting**: Azure Static Web Apps or Blob Storage
- **API Integration**: RESTful communication with Azure Functions

### Storage
- **Azure Blob Storage**: Temporary file storage
- **Container**: `pdf-uploads`
- **Retention**: Files can be automatically cleaned up after processing

## Prerequisites

- Node.js 20.x or higher
- Azure subscription
- Azure CLI installed
- Azure Functions Core Tools

## Local Development

### 1. Clone and Install

```bash
git clone <repository-url>
cd PDFOptimizer
npm install
```

### 2. Configure Local Settings

Create a `local.settings.json` file:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true",
    "BLOB_CONTAINER_NAME": "pdf-uploads"
  },
  "Host": {
    "CORS": "*"
  }
}
```

### 3. Start Azurite (Local Storage Emulator)

```bash
# Install Azurite if not already installed
npm install -g azurite

# Start Azurite
azurite --silent --location ./azurite --debug ./azurite/debug.log
```

### 4. Build and Run

```bash
# Build TypeScript
npm run build

# Start Azure Functions
npm start
```

The API will be available at `http://localhost:7071/api`

### 5. Serve Frontend

```bash
# In a new terminal, serve the frontend
cd public
python3 -m http.server 8000
# Or use any static file server
```

Open `http://localhost:8000` in your browser.

## Deployment to Azure

### Option 1: Automated Deployment Script

```bash
chmod +x deploy.sh
./deploy.sh
```

Follow the prompts to:
1. Enter your Azure resource names
2. Create necessary Azure resources
3. Deploy the application

### Option 2: Manual Deployment

#### Step 1: Create Azure Resources

```bash
# Variables
RESOURCE_GROUP="pdf-optimizer-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="pdfoptimizerstore"
FUNCTION_APP="pdf-optimizer-func"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS

# Create blob container
az storage container create \
  --name pdf-uploads \
  --account-name $STORAGE_ACCOUNT \
  --public-access blob

# Create function app
az functionapp create \
  --resource-group $RESOURCE_GROUP \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name $FUNCTION_APP \
  --storage-account $STORAGE_ACCOUNT
```

#### Step 2: Configure Application Settings

```bash
# Get storage connection string
CONNECTION_STRING=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString -o tsv)

# Set function app settings
az functionapp config appsettings set \
  --name $FUNCTION_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
  "AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING" \
  "BLOB_CONTAINER_NAME=pdf-uploads"
```

#### Step 3: Deploy Functions

```bash
# Build and deploy
npm run build
func azure functionapp publish $FUNCTION_APP
```

#### Step 4: Deploy Frontend

**Option A: Azure Static Web Apps**

```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./public --deployment-token <YOUR_DEPLOYMENT_TOKEN>
```

**Option B: Azure Blob Storage Static Website**

```bash
# Enable static website
az storage blob service-properties update \
  --account-name $STORAGE_ACCOUNT \
  --static-website \
  --index-document index.html

# Upload files
az storage blob upload-batch \
  --account-name $STORAGE_ACCOUNT \
  --destination '$web' \
  --source ./public
```

## API Endpoints

### POST /api/uploadAnalyze
Uploads and analyzes a PDF file.

**Request**: multipart/form-data with `file` field

**Response**:
```json
{
  "hasJavaScript": true,
  "javascriptElements": [
    {
      "page": 1,
      "type": "navigation",
      "action": "JavaScript",
      "code": "this.pageNum = 5;",
      "canConvertToHyperlink": true,
      "targetPage": 5,
      "annotationIndex": 0
    }
  ],
  "externalHyperlinks": [
    {
      "page": 2,
      "url": "https://example.com"
    }
  ],
  "totalPages": 10,
  "fileName": "document.pdf",
  "fileId": "uuid",
  "warnings": []
}
```

### POST /api/convertPDF
Converts a PDF based on specified mappings.

**Request**:
```json
{
  "fileId": "uuid",
  "conversions": [
    {
      "elementIndex": 0,
      "action": "convert",
      "targetPage": 5
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "fileId": "uuid",
  "downloadUrl": "https://...",
  "convertedElements": 3,
  "removedElements": 2
}
```

### GET /api/downloadPDF
Downloads a converted PDF.

**Parameters**:
- `fileId`: The file identifier
- `fileName`: The file name

## How It Works

### 1. Upload Phase
- User uploads a PDF file via drag-and-drop or file selector
- File is validated as a PDF
- File is uploaded to Azure Blob Storage
- Unique file ID is generated for tracking

### 2. Analysis Phase
- PDF is parsed using `pdf-lib`
- All annotations are examined for actions
- JavaScript actions are extracted and categorized:
  - **Navigation**: Page changes, GoTo actions
  - **Popup**: Alert dialogs, popups
  - **Mouseover**: Mouse event handlers
  - **Form**: Form field interactions
  - **Other**: Miscellaneous JavaScript
- Each element is assessed for conversion feasibility
- External hyperlinks are identified and catalogued

### 3. Review Phase
- Results are displayed to the user
- User can:
  - Choose to convert, remove, or keep each element
  - Modify target pages for navigation elements
  - Update URLs for external links
- Warnings are shown for elements that can't be converted

### 4. Conversion Phase
- Original PDF is retrieved from storage
- For each element:
  - **Convert**: JavaScript action is replaced with a standard GoTo or URI action
  - **Remove**: Annotation is removed from the PDF
  - **Keep**: Element is left unchanged (not recommended)
- Additional actions (mouse events) are automatically removed
- Document-level JavaScript is stripped
- Modified PDF is saved to storage

### 5. Download Phase
- User downloads the converted PDF
- File can be uploaded to SharePoint
- Original and converted files are stored temporarily

## Understanding PDF JavaScript

### Common InDesign JavaScript Patterns

**Page Navigation**:
```javascript
// InDesign exports these as JavaScript actions
this.pageNum = 5;  // Go to page 5
this.pageNum++;    // Next page
this.pageNum--;    // Previous page
```

**URL Launch**:
```javascript
app.launchURL("https://example.com");
```

**Named Actions**:
```javascript
// NextPage, PrevPage, FirstPage, LastPage
```

### What Can Be Converted

✅ **Page navigation** → Internal links to specific pages
✅ **URL launches** → External hyperlinks
✅ **Named page actions** → Internal links

### What Cannot Be Converted

❌ **Alert dialogs** - No equivalent in PDF hyperlinks
❌ **Form field manipulation** - Requires JavaScript
❌ **Mouse events** - Not supported by SharePoint viewer
❌ **Complex logic** - No direct conversion

These elements will be flagged for removal or kept with a warning.

## SharePoint Compatibility

### Supported Features
- Internal page links (GoTo actions)
- External URL links (URI actions)
- Link annotations with visual highlighting
- Standard PDF navigation

### Unsupported Features
- JavaScript execution
- Mouse event handlers (onEnter, onExit, etc.)
- Form field JavaScript
- Document-level scripts
- Alert dialogs and popups

## Troubleshooting

### Local Development Issues

**Problem**: Functions don't start
- Ensure Node.js 20.x is installed
- Run `npm install` to install dependencies
- Check that `local.settings.json` exists
- Start Azurite before starting functions

**Problem**: Can't upload files
- Check CORS settings in `local.settings.json`
- Ensure Azurite is running
- Verify blob container exists

### Deployment Issues

**Problem**: Functions deploy but don't work
- Check Application Insights logs in Azure Portal
- Verify environment variables are set correctly
- Ensure storage connection string is valid
- Check that blob container exists

**Problem**: CORS errors
- Add your frontend URL to Function App CORS settings
- Use wildcard "*" for development (not recommended for production)

### PDF Processing Issues

**Problem**: Analysis fails
- Ensure PDF is not password-protected
- Check PDF is not corrupted
- Verify PDF was created with InDesign or similar tool
- Some PDFs may have complex structures that aren't supported

**Problem**: Conversion doesn't preserve functionality
- Some JavaScript is too complex to convert
- Review the warnings in the analysis results
- Consider simplifying the InDesign document

## Security Considerations

### Production Deployment

1. **Authentication**: Add Azure AD authentication
   ```bash
   az functionapp auth update \
     --name $FUNCTION_APP \
     --resource-group $RESOURCE_GROUP \
     --enabled true
   ```

2. **CORS**: Restrict to specific domains
   ```bash
   az functionapp cors remove --name $FUNCTION_APP -g $RESOURCE_GROUP --allowed-origins "*"
   az functionapp cors add --name $FUNCTION_APP -g $RESOURCE_GROUP --allowed-origins "https://yourdomain.com"
   ```

3. **Storage**: Use private blob access and SAS tokens
4. **Cleanup**: Implement automatic file deletion after 24 hours
5. **File Size Limits**: Add file size validation
6. **Rate Limiting**: Implement rate limiting for API endpoints

## Cost Estimation

### Azure Resources (Monthly)

- **Function App** (Consumption Plan): ~$0-20 (first 1M executions free)
- **Storage Account**: ~$1-5 (depends on usage)
- **Bandwidth**: ~$1-10 (depends on file sizes and traffic)

**Estimated Total**: $5-35/month for moderate usage

## Future Enhancements

- [ ] Batch processing of multiple PDFs
- [ ] PDF comparison before/after conversion
- [ ] Support for encrypted PDFs
- [ ] Integration with SharePoint upload
- [ ] Automated testing of converted PDFs
- [ ] Support for more JavaScript patterns
- [ ] PDF optimization (compression)
- [ ] User authentication and file history
- [ ] API rate limiting
- [ ] Automated cleanup of old files

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Acknowledgments

- Built with [pdf-lib](https://pdf-lib.js.org/)
- Powered by Azure Functions and Azure Storage
- Designed for Adobe InDesign workflows
