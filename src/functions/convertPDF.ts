import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { PDFConverter } from '../utils/pdfConverter';
import { StorageHelper } from '../utils/storageHelper';
import { ConversionRequest } from '../types';

/**
 * Azure Function: Convert PDF
 *
 * This function takes a file ID and conversion mappings,
 * retrieves the original PDF, applies the conversions,
 * and saves the converted PDF.
 */
export async function convertPDF(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Processing PDF conversion request');

  try {
    // Parse request body
    const body = await request.json() as ConversionRequest;

    if (!body.fileId) {
      return {
        status: 400,
        jsonBody: {
          error: 'File ID is required'
        }
      };
    }

    if (!body.conversions || !Array.isArray(body.conversions)) {
      return {
        status: 400,
        jsonBody: {
          error: 'Conversions array is required'
        }
      };
    }

    // Initialize storage helper
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    const containerName = process.env.BLOB_CONTAINER_NAME || 'pdf-uploads';
    const storageHelper = new StorageHelper(connectionString, containerName);

    // Get the original file name (you'd need to store this mapping)
    // For now, we'll use a convention
    const fileName = 'uploaded.pdf'; // You should retrieve this from metadata

    // Download the original PDF
    context.log(`Downloading PDF with ID: ${body.fileId}`);
    const originalBuffer = await storageHelper.downloadPDF(body.fileId, fileName);

    // Convert the PDF
    context.log(`Converting PDF with ${body.conversions.length} conversions`);
    const { pdfBytes, result } = await PDFConverter.convertPDF(
      originalBuffer,
      body.conversions,
      body.fileId
    );

    // Save the converted PDF
    context.log('Saving converted PDF');
    const downloadUrl = await storageHelper.saveConvertedPDF(
      body.fileId,
      pdfBytes,
      fileName
    );

    result.downloadUrl = downloadUrl;

    context.log('Conversion complete');

    return {
      status: 200,
      jsonBody: result,
      headers: {
        'Content-Type': 'application/json'
      }
    };

  } catch (error) {
    context.error('Error processing conversion:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'An error occurred while converting the PDF',
        details: error.message
      }
    };
  }
}

app.http('convertPDF', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: convertPDF
});
