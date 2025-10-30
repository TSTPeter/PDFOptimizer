# Architecture Documentation

## System Overview

The PDF JavaScript Optimizer is a serverless web application built on Azure that processes PDF files to make them compatible with SharePoint's PDF viewer.

## Architecture Diagram

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────┐
│     Frontend (Static Web App)       │
│  ┌───────────────────────────────┐  │
│  │  HTML/CSS/JavaScript          │  │
│  │  - File Upload UI             │  │
│  │  - Analysis Display           │  │
│  │  - Conversion Controls        │  │
│  └───────────────────────────────┘  │
└─────────────┬───────────────────────┘
              │ HTTPS/REST
              ↓
┌─────────────────────────────────────┐
│   Azure Functions (Backend API)     │
│  ┌───────────────────────────────┐  │
│  │  uploadAnalyze Function       │  │
│  │  ├─ Receive PDF               │  │
│  │  ├─ Store in Blob              │  │
│  │  └─ Analyze JavaScript         │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  convertPDF Function          │  │
│  │  ├─ Retrieve PDF               │  │
│  │  ├─ Apply Conversions          │  │
│  │  └─ Save Modified PDF          │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  downloadPDF Function         │  │
│  │  └─ Return converted file      │  │
│  └───────────────────────────────┘  │
└─────────────┬───────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│     Azure Blob Storage              │
│  ┌───────────────────────────────┐  │
│  │  pdf-uploads container        │  │
│  │  ├─ {fileId}/original.pdf     │  │
│  │  └─ {fileId}/converted.pdf    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Component Details

### 1. Frontend Layer

**Technology**: Vanilla JavaScript, HTML5, CSS3

**Responsibilities**:
- User interface for file upload
- Display analysis results
- Allow user to configure conversions
- Initiate conversion process
- Download converted files

**Key Files**:
- `public/index.html`: Main HTML structure
- `public/styles.css`: Styling and layout
- `public/app.js`: Application logic and API communication

**Features**:
- Drag-and-drop file upload
- Real-time analysis display
- Interactive element configuration
- Progress indicators
- Responsive design

### 2. Backend API Layer

**Technology**: Azure Functions v4, TypeScript, Node.js 20

**Architecture Pattern**: Serverless microservices

#### Function: uploadAnalyze

**Trigger**: HTTP POST
**Route**: `/api/uploadAnalyze`
**Purpose**: Receives PDF, stores it, and analyzes JavaScript elements

**Flow**:
```
1. Receive multipart/form-data with PDF file
2. Validate file type and size
3. Generate unique file ID (UUID)
4. Upload to Blob Storage
5. Load PDF with pdf-lib
6. Iterate through all pages
7. Extract annotations and actions
8. Identify JavaScript elements
9. Categorize by type
10. Assess conversion feasibility
11. Return analysis results
```

**Key Code**: `src/functions/uploadAnalyze.ts`

#### Function: convertPDF

**Trigger**: HTTP POST
**Route**: `/api/convertPDF`
**Purpose**: Applies conversions to PDF based on user selections

**Flow**:
```
1. Receive conversion mappings
2. Retrieve original PDF from storage
3. Load PDF with pdf-lib
4. For each conversion:
   - Convert: Replace JavaScript with hyperlink
   - Remove: Delete the annotation
   - Keep: Leave unchanged
5. Remove all additional actions (mouse events)
6. Strip document-level JavaScript
7. Save modified PDF
8. Return download URL
```

**Key Code**: `src/functions/convertPDF.ts`

#### Function: downloadPDF

**Trigger**: HTTP GET
**Route**: `/api/downloadPDF`
**Purpose**: Retrieves converted PDF for download

**Flow**:
```
1. Receive file ID and file name
2. Retrieve file from Blob Storage
3. Return as application/pdf
4. Set Content-Disposition header
```

**Key Code**: `src/functions/downloadPDF.ts`

### 3. PDF Processing Layer

**Technology**: pdf-lib, TypeScript

#### PDFAnalyzer

**Purpose**: Extracts and analyzes JavaScript elements from PDFs

**Key Methods**:

```typescript
analyzePDF(pdfBuffer, fileName, fileId): Promise<AnalysisResult>
  - Main analysis entry point
  - Iterates through all pages and annotations
  - Returns comprehensive analysis

extractJavaScriptAction(action, page, index, pdfDoc): JavaScriptElement | null
  - Extracts JavaScript from action dictionaries
  - Identifies action types (JavaScript, GoTo, URI, Named)
  - Assesses conversion feasibility

extractAdditionalActions(aa, page, index, pdfDoc): JavaScriptElement[]
  - Extracts mouse event handlers
  - Handles Enter, Exit, Down, Up, Focus, Blur events

categorizeJavaScript(code): JavaScriptElement['type']
  - Classifies JavaScript by type
  - Navigation, popup, mouseover, form, other

parseNavigationJavaScript(code): { targetPage?, targetUrl? } | null
  - Parses navigation patterns
  - Extracts target pages and URLs
```

**Key Code**: `src/utils/pdfAnalyzer.ts`

#### PDFConverter

**Purpose**: Modifies PDFs to remove/convert JavaScript

**Key Methods**:

```typescript
convertPDF(pdfBuffer, conversions, fileId): Promise<ConversionResult>
  - Main conversion entry point
  - Applies all conversion mappings
  - Returns conversion summary

convertToInternalLink(annot, targetPage, pdfDoc): void
  - Converts JavaScript to GoTo action
  - Creates internal page link

convertToExternalLink(annot, targetUrl): void
  - Converts JavaScript to URI action
  - Creates external hyperlink

removeAllJavaScript(pdfBuffer): Promise<Buffer>
  - Nuclear option: removes all JavaScript
  - No conversion, just removal
```

**Key Code**: `src/utils/pdfConverter.ts`

### 4. Storage Layer

**Technology**: Azure Blob Storage

**Container Structure**:
```
pdf-uploads/
├── {fileId-1}/
│   ├── original.pdf
│   └── converted.pdf
├── {fileId-2}/
│   ├── original.pdf
│   └── converted.pdf
└── ...
```

**StorageHelper**:

```typescript
uploadPDF(buffer, fileName): Promise<string>
  - Uploads original PDF
  - Returns unique file ID

downloadPDF(fileId, fileName): Promise<Buffer>
  - Retrieves PDF from storage

saveConvertedPDF(fileId, buffer, originalFileName): Promise<string>
  - Saves converted PDF
  - Returns download URL

deleteFiles(fileId): Promise<void>
  - Cleanup: removes all files for a file ID
```

**Key Code**: `src/utils/storageHelper.ts`

## Data Flow

### Upload and Analysis Flow

```
User                 Frontend              Azure Functions         Blob Storage         pdf-lib
  │                     │                        │                      │                  │
  │  Select PDF         │                        │                      │                  │
  │────────────────────>│                        │                      │                  │
  │                     │                        │                      │                  │
  │                     │  POST /uploadAnalyze   │                      │                  │
  │                     │───────────────────────>│                      │                  │
  │                     │                        │                      │                  │
  │                     │                        │  Upload PDF          │                  │
  │                     │                        │─────────────────────>│                  │
  │                     │                        │                      │                  │
  │                     │                        │  Load PDF            │                  │
  │                     │                        │─────────────────────────────────────────>│
  │                     │                        │                      │                  │
  │                     │                        │  Parse structure     │                  │
  │                     │                        │<─────────────────────────────────────────│
  │                     │                        │                      │                  │
  │                     │  Analysis Results      │                      │                  │
  │                     │<───────────────────────│                      │                  │
  │                     │                        │                      │                  │
  │  Display Results    │                        │                      │                  │
  │<────────────────────│                        │                      │                  │
```

### Conversion and Download Flow

```
User                 Frontend              Azure Functions         Blob Storage         pdf-lib
  │                     │                        │                      │                  │
  │  Configure          │                        │                      │                  │
  │  Conversions        │                        │                      │                  │
  │────────────────────>│                        │                      │                  │
  │                     │                        │                      │                  │
  │                     │  POST /convertPDF      │                      │                  │
  │                     │───────────────────────>│                      │                  │
  │                     │                        │                      │                  │
  │                     │                        │  Download original   │                  │
  │                     │                        │─────────────────────>│                  │
  │                     │                        │                      │                  │
  │                     │                        │  Load PDF            │                  │
  │                     │                        │─────────────────────────────────────────>│
  │                     │                        │                      │                  │
  │                     │                        │  Modify annotations  │                  │
  │                     │                        │<─────────────────────────────────────────│
  │                     │                        │                      │                  │
  │                     │                        │  Upload converted    │                  │
  │                     │                        │─────────────────────>│                  │
  │                     │                        │                      │                  │
  │                     │  Conversion Result     │                      │                  │
  │                     │<───────────────────────│                      │                  │
  │                     │                        │                      │                  │
  │  Download button    │                        │                      │                  │
  │<────────────────────│                        │                      │                  │
  │                     │                        │                      │                  │
  │  Click download     │                        │                      │                  │
  │────────────────────>│                        │                      │                  │
  │                     │                        │                      │                  │
  │                     │  GET /downloadPDF      │                      │                  │
  │                     │───────────────────────>│                      │                  │
  │                     │                        │                      │                  │
  │                     │                        │  Download file       │                  │
  │                     │                        │─────────────────────>│                  │
  │                     │                        │                      │                  │
  │                     │  PDF file stream       │                      │                  │
  │                     │<───────────────────────│                      │                  │
  │                     │                        │                      │                  │
  │  Save file          │                        │                      │                  │
  │<────────────────────│                        │                      │                  │
```

## PDF Structure Understanding

### PDF Annotation Structure

```
Page
 └─ Annots []
     └─ Annotation
         ├─ Subtype: /Link, /Widget, etc.
         ├─ Rect: [x1, y1, x2, y2]
         ├─ A (Action)
         │   ├─ S: /JavaScript, /GoTo, /URI, /Named
         │   ├─ JS: JavaScript code string
         │   ├─ D: Destination (for GoTo)
         │   └─ URI: URL string (for URI)
         └─ AA (Additional Actions)
             ├─ E: MouseEnter
             ├─ X: MouseExit
             ├─ D: MouseDown
             ├─ U: MouseUp
             ├─ Fo: Focus
             └─ Bl: Blur
```

### JavaScript Action Types Handled

1. **Direct JavaScript** (`/JavaScript`)
   ```javascript
   this.pageNum = 5;
   app.launchURL("https://example.com");
   ```

2. **GoTo Actions** (`/GoTo`)
   - Internal page navigation
   - Already compatible, preserved

3. **URI Actions** (`/URI`)
   - External links
   - Already compatible, preserved

4. **Named Actions** (`/Named`)
   - NextPage, PrevPage, etc.
   - Can be converted to GoTo

5. **Additional Actions** (`/AA`)
   - Mouse events
   - Not compatible, removed

## Conversion Strategies

### Strategy 1: Navigation Conversion

**Pattern**: `this.pageNum = N`

**Conversion**:
```
Before:
  A { S: /JavaScript, JS: "this.pageNum = 5;" }

After:
  A { S: /GoTo, D: [Page5Ref, /Fit] }
```

### Strategy 2: URL Conversion

**Pattern**: `app.launchURL("...")`

**Conversion**:
```
Before:
  A { S: /JavaScript, JS: "app.launchURL('https://example.com');" }

After:
  A { S: /URI, URI: "https://example.com" }
```

### Strategy 3: Removal

**Pattern**: Complex JavaScript, popups, mouse events

**Action**: Delete annotation or remove action dictionary

## Scalability Considerations

### Current Architecture (Consumption Plan)

**Limits**:
- Max execution time: 5 minutes (upgradeable to 10 minutes)
- Max concurrent executions: 200 (per region)
- Max memory: 1.5 GB per instance

**Scaling**:
- Automatic horizontal scaling
- Cold start: ~1-2 seconds
- Warm instances maintained based on usage

### Optimization Strategies

1. **Function Execution**:
   - Keep functions small and focused
   - Minimize cold starts with warm-up techniques
   - Use async/await for I/O operations

2. **Blob Storage**:
   - Use SAS tokens for direct client uploads (future)
   - Implement lifecycle policies for cleanup
   - Consider CDN for static content

3. **PDF Processing**:
   - Stream large PDFs instead of loading entirely
   - Implement pagination for analysis results
   - Consider splitting large PDFs

### High-Traffic Scenarios

For high-traffic scenarios, consider:

1. **Premium Plan**: Eliminates cold starts
2. **Queue-based Processing**: Decouple upload from processing
3. **Durable Functions**: For long-running operations
4. **Caching**: Cache analysis results

## Security Architecture

### Authentication Flow (Optional)

```
User → Azure AD → Function App (with auth) → Backend Logic
```

### Data Security

1. **In Transit**:
   - HTTPS enforced for all connections
   - TLS 1.2+ required

2. **At Rest**:
   - Azure Storage encryption (256-bit AES)
   - Optional: Customer-managed keys

3. **Access Control**:
   - Managed Identity for Function App
   - RBAC for storage access
   - SAS tokens with expiration

### Input Validation

1. **File Type**: Verify PDF signature
2. **File Size**: Enforce maximum size
3. **Content**: Sanitize file names
4. **Rate Limiting**: Prevent abuse

## Monitoring and Observability

### Application Insights Integration

**Metrics Tracked**:
- Function execution count
- Function execution duration
- Success/failure rates
- Exception tracking
- Custom events

**Custom Events**:
```typescript
context.log('PDF analyzed', {
  fileId: fileId,
  jsElementsFound: elements.length,
  convertibleElements: convertible.length,
  processingTime: duration
});
```

### Health Checks

Implement health check endpoints:
```typescript
app.http('health', {
  methods: ['GET'],
  handler: async () => ({
    status: 200,
    jsonBody: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    }
  })
});
```

## Error Handling

### Error Categories

1. **User Errors** (4xx):
   - Invalid file type
   - Missing parameters
   - Malformed requests

2. **System Errors** (5xx):
   - Storage failures
   - PDF parsing errors
   - Timeout errors

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "details": "Technical details",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Performance Benchmarks

**Expected Performance** (varies by PDF size):

| PDF Pages | File Size | Analysis Time | Conversion Time |
|-----------|-----------|---------------|-----------------|
| 1-10      | < 1 MB    | 1-2 seconds   | 1-2 seconds     |
| 11-50     | 1-5 MB    | 2-5 seconds   | 2-5 seconds     |
| 51-100    | 5-10 MB   | 5-10 seconds  | 5-10 seconds    |
| 100+      | > 10 MB   | 10-30 seconds | 10-30 seconds   |

## Future Architecture Enhancements

1. **Queue-based Processing**:
   ```
   User → Upload → Queue → Function → Process → Notification
   ```

2. **WebSocket Updates**:
   Real-time progress updates using SignalR

3. **Batch Processing**:
   Handle multiple PDFs simultaneously

4. **Machine Learning**:
   Predict best conversion strategies based on patterns

5. **Distributed Processing**:
   Split large PDFs across multiple function instances

## Technology Choices Rationale

### Why Azure Functions?
- Serverless: No infrastructure management
- Auto-scaling: Handles variable load
- Cost-effective: Pay per execution
- Quick deployment: Fast iteration

### Why pdf-lib?
- Pure JavaScript: Works in Node.js
- Comprehensive: Full PDF manipulation
- Active maintenance: Regular updates
- No native dependencies: Easy deployment

### Why Blob Storage?
- Scalable: Handles large files
- Cost-effective: Low storage costs
- Integrated: Works well with Functions
- Secure: Built-in encryption

### Why TypeScript?
- Type safety: Catch errors early
- Better tooling: IntelliSense, refactoring
- Documentation: Self-documenting code
- Maintainability: Easier to understand

## Deployment Architecture

### Development Environment
```
Local Machine
├── Functions running locally (func start)
├── Azurite (storage emulator)
└── Static file server (public folder)
```

### Production Environment
```
Azure
├── Function App (API backend)
├── Storage Account
│   ├── Blob containers (PDFs)
│   └── $web container (static site - optional)
└── Static Web App (frontend) - optional
```

## API Contract

### Request/Response Types

See `src/types/index.ts` for complete type definitions.

**Key Types**:
- `AnalysisResult`: Output of PDF analysis
- `ConversionRequest`: Input for PDF conversion
- `ConversionResult`: Output of PDF conversion
- `JavaScriptElement`: Represents a JS element in PDF
- `ExternalHyperlink`: Represents an external link

## Conclusion

This architecture provides a scalable, maintainable solution for converting InDesign PDFs with JavaScript to SharePoint-compatible formats. The serverless approach minimizes operational overhead while the modular design allows for easy enhancements and modifications.
