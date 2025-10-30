import { PDFDocument, PDFDict, PDFName, PDFArray, rgb } from 'pdf-lib';
import { ConversionMapping, ConversionResult } from '../types';

export class PDFConverter {
  /**
   * Converts a PDF by removing/replacing JavaScript elements
   */
  static async convertPDF(
    pdfBuffer: Buffer,
    conversions: ConversionMapping[],
    fileId: string
  ): Promise<{ pdfBytes: Buffer; result: ConversionResult }> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    let convertedElements = 0;
    let removedElements = 0;
    const errors: string[] = [];

    // Build a map of annotations to process
    const annotationsToProcess: Map<string, ConversionMapping> = new Map();
    conversions.forEach((conv, index) => {
      annotationsToProcess.set(`${index}`, conv);
    });

    // Process each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];

      try {
        const annotations = page.node.Annots();

        if (annotations) {
          const annotsArray = pdfDoc.context.lookup(annotations) as PDFArray;

          if (annotsArray && annotsArray.asArray) {
            const annots = annotsArray.asArray();
            const newAnnots: any[] = [];

            for (let annotIndex = 0; annotIndex < annots.length; annotIndex++) {
              const annotRef = annots[annotIndex];
              const annot = pdfDoc.context.lookup(annotRef) as PDFDict;

              if (!annot || !annot.dict) {
                newAnnots.push(annotRef);
                continue;
              }

              let shouldKeep = true;
              let modified = false;

              // Check if this annotation should be processed
              const conversion = conversions.find(c => {
                // Match by annotation index if available
                // This is a simplified matching - in production you'd need more robust tracking
                return true; // Process all for now
              });

              // Remove JavaScript actions
              const action = annot.lookup(PDFName.of('A'));
              if (action && action instanceof PDFDict) {
                const actionType = action.lookup(PDFName.of('S'));

                if (actionType) {
                  const actionTypeStr = actionType.toString();

                  // Handle JavaScript actions
                  if (actionTypeStr === '/JavaScript') {
                    if (conversion?.action === 'remove') {
                      shouldKeep = false;
                      removedElements++;
                    } else if (conversion?.action === 'convert') {
                      // Try to convert to hyperlink
                      if (conversion.targetPage !== undefined) {
                        this.convertToInternalLink(annot, conversion.targetPage, pdfDoc);
                        convertedElements++;
                        modified = true;
                      } else if (conversion.targetUrl) {
                        this.convertToExternalLink(annot, conversion.targetUrl);
                        convertedElements++;
                        modified = true;
                      } else {
                        shouldKeep = false;
                        removedElements++;
                      }
                    }
                  }
                }
              }

              // Remove additional actions (mouse events)
              const additionalActions = annot.lookup(PDFName.of('AA'));
              if (additionalActions && additionalActions instanceof PDFDict) {
                // Remove all additional actions as they're not supported in SharePoint
                annot.delete(PDFName.of('AA'));
                removedElements++;
                modified = true;
              }

              if (shouldKeep) {
                newAnnots.push(annotRef);
              }
            }

            // Update the annotations array if we removed any
            if (newAnnots.length !== annots.length) {
              const newAnnotsArray = PDFArray.withContext(pdfDoc.context);
              newAnnots.forEach(ref => newAnnotsArray.push(ref));
              page.node.set(PDFName.of('Annots'), newAnnotsArray);
            }
          }
        }
      } catch (error) {
        errors.push(`Error processing page ${pageIndex + 1}: ${error.message}`);
      }
    }

    // Remove document-level JavaScript
    try {
      const catalog = pdfDoc.catalog;
      const names = catalog.lookup(PDFName.of('Names'));
      if (names && names instanceof PDFDict) {
        const javascript = names.lookup(PDFName.of('JavaScript'));
        if (javascript) {
          names.delete(PDFName.of('JavaScript'));
          removedElements++;
        }
      }
    } catch (error) {
      errors.push(`Error removing document-level JavaScript: ${error.message}`);
    }

    // Save the modified PDF
    const pdfBytes = await pdfDoc.save();

    const result: ConversionResult = {
      success: errors.length === 0,
      fileId,
      convertedElements,
      removedElements,
      errors: errors.length > 0 ? errors : undefined
    };

    return {
      pdfBytes: Buffer.from(pdfBytes),
      result
    };
  }

  /**
   * Converts an annotation to an internal page link
   */
  private static convertToInternalLink(
    annot: PDFDict,
    targetPage: number,
    pdfDoc: PDFDocument
  ): void {
    // Remove JavaScript action
    annot.delete(PDFName.of('A'));

    // Create GoTo action
    const gotoAction = pdfDoc.context.obj({
      S: PDFName.of('GoTo'),
      D: [pdfDoc.getPage(targetPage).ref, PDFName.of('Fit')]
    });

    annot.set(PDFName.of('A'), gotoAction);

    // Ensure it's a link annotation
    annot.set(PDFName.of('Subtype'), PDFName.of('Link'));

    // Add visual highlight
    annot.set(PDFName.of('H'), PDFName.of('I')); // Invert highlight
  }

  /**
   * Converts an annotation to an external URL link
   */
  private static convertToExternalLink(
    annot: PDFDict,
    targetUrl: string
  ): void {
    // Remove JavaScript action
    annot.delete(PDFName.of('A'));

    // Create URI action
    const uriAction: any = {
      S: PDFName.of('URI'),
      URI: targetUrl
    };

    annot.set(PDFName.of('A'), PDFDict.fromMapWithContext(
      new Map([
        [PDFName.of('S'), PDFName.of('URI')],
        [PDFName.of('URI'), targetUrl]
      ]),
      annot.context
    ));

    // Ensure it's a link annotation
    annot.set(PDFName.of('Subtype'), PDFName.of('Link'));

    // Add visual highlight
    annot.set(PDFName.of('H'), PDFName.of('I'));
  }

  /**
   * Removes all JavaScript from a PDF (nuclear option)
   */
  static async removeAllJavaScript(pdfBuffer: Buffer): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    // Remove JavaScript from all annotations
    for (const page of pages) {
      const annotations = page.node.Annots();

      if (annotations) {
        const annotsArray = pdfDoc.context.lookup(annotations) as PDFArray;

        if (annotsArray && annotsArray.asArray) {
          const annots = annotsArray.asArray();

          for (const annotRef of annots) {
            const annot = pdfDoc.context.lookup(annotRef) as PDFDict;

            if (!annot || !annot.dict) continue;

            // Remove JavaScript actions
            const action = annot.lookup(PDFName.of('A'));
            if (action && action instanceof PDFDict) {
              const actionType = action.lookup(PDFName.of('S'));
              if (actionType && actionType.toString() === '/JavaScript') {
                annot.delete(PDFName.of('A'));
              }
            }

            // Remove additional actions
            annot.delete(PDFName.of('AA'));
          }
        }
      }
    }

    // Remove document-level JavaScript
    const catalog = pdfDoc.catalog;
    const names = catalog.lookup(PDFName.of('Names'));
    if (names && names instanceof PDFDict) {
      names.delete(PDFName.of('JavaScript'));
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
