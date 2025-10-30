import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { PDFAnalyzer } from '../utils/pdfAnalyzer';
import { StorageHelper } from '../utils/storageHelper';

/**
 * Azure Function: Upload and Analyze PDF
 *
 * This function receives a PDF file, uploads it to blob storage,
 * analyzes it for JavaScript elements, and returns the analysis results.
 */
export async function uploadAnalyze(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Processing upload and analyze request');

  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return {
        status: 400,
        jsonBody: {
          error: 'No file provided. Please upload a PDF file.'
        }
      };
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return {
        status: 400,
        jsonBody: {
          error: 'Invalid file type. Please upload a PDF file.'
        }
      };
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Initialize storage helper
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const containerName = process.env.BLOB_CONTAINER_NAME || 'pdf-uploads';
    const storageHelper = new StorageHelper(connectionString, containerName);
    await storageHelper.initialize();

    // Upload the file
    context.log(`Uploading file: ${file.name}`);
    const fileId = await storageHelper.uploadPDF(buffer, file.name);

    // Analyze the PDF
    context.log(`Analyzing PDF with ID: ${fileId}`);
    const analysis = await PDFAnalyzer.analyzePDF(buffer, file.name, fileId);

    context.log(`Analysis complete. Found ${analysis.javascriptElements.length} JavaScript elements`);

    return {
      status: 200,
      jsonBody: analysis,
      headers: {
        'Content-Type': 'application/json'
      }
    };

  } catch (error) {
    context.error('Error processing request:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'An error occurred while processing the PDF',
        details: error.message
      }
    };
  }
}

app.http('uploadAnalyze', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: uploadAnalyze
});
