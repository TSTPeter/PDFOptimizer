import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';

export class StorageHelper {
  private containerClient: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobServiceClient.getContainerClient(containerName);
  }

  /**
   * Initializes the storage container
   */
  async initialize(): Promise<void> {
    await this.containerClient.createIfNotExists({
      access: 'blob'
    });
  }

  /**
   * Uploads a PDF file and returns its unique ID
   */
  async uploadPDF(buffer: Buffer, fileName: string): Promise<string> {
    const fileId = uuidv4();
    const blobName = `${fileId}/${fileName}`;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/pdf'
      }
    });

    return fileId;
  }

  /**
   * Downloads a PDF file by ID
   */
  async downloadPDF(fileId: string, fileName: string): Promise<Buffer> {
    const blobName = `${fileId}/${fileName}`;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download(0);
    const chunks: Buffer[] = [];

    for await (const chunk of downloadResponse.readableStreamBody!) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Saves a converted PDF
   */
  async saveConvertedPDF(fileId: string, buffer: Buffer, originalFileName: string): Promise<string> {
    const convertedFileName = originalFileName.replace('.pdf', '_converted.pdf');
    const blobName = `${fileId}/${convertedFileName}`;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/pdf'
      }
    });

    return blockBlobClient.url;
  }

  /**
   * Gets a SAS URL for downloading a file
   */
  async getDownloadUrl(fileId: string, fileName: string): Promise<string> {
    const blobName = `${fileId}/${fileName}`;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    // For simplicity, return the public URL
    // In production, you should generate a SAS token
    return blockBlobClient.url;
  }

  /**
   * Deletes files associated with a file ID
   */
  async deleteFiles(fileId: string): Promise<void> {
    const prefix = `${fileId}/`;

    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      await this.containerClient.deleteBlob(blob.name);
    }
  }
}
