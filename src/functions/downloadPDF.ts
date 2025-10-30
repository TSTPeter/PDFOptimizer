import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { StorageHelper } from '../utils/storageHelper';

/**
 * Azure Function: Download PDF
 *
 * This function retrieves a converted PDF from blob storage
 * and returns it for download.
 */
export async function downloadPDF(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Processing PDF download request');

  try {
    // Get query parameters
    const fileId = request.query.get('fileId');
    const fileName = request.query.get('fileName') || 'converted.pdf';

    if (!fileId) {
      return {
        status: 400,
        jsonBody: {
          error: 'File ID is required'
        }
      };
    }

    // Initialize storage helper
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const containerName = process.env.BLOB_CONTAINER_NAME || 'pdf-uploads';
    const storageHelper = new StorageHelper(connectionString, containerName);

    // Download the file
    context.log(`Downloading PDF: ${fileId}/${fileName}`);
    const buffer = await storageHelper.downloadPDF(fileId, fileName);

    return {
      status: 200,
      body: buffer,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    };

  } catch (error) {
    context.error('Error downloading PDF:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'An error occurred while downloading the PDF',
        details: error.message
      }
    };
  }
}

app.http('downloadPDF', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: downloadPDF
});
