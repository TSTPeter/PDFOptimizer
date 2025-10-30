import { PDFDocument, PDFDict, PDFName, PDFArray, PDFString, PDFHexString } from 'pdf-lib';
import { JavaScriptElement, ExternalHyperlink, AnalysisResult } from '../types';

export class PDFAnalyzer {
  /**
   * Analyzes a PDF buffer for JavaScript elements and hyperlinks
   */
  static async analyzePDF(pdfBuffer: Buffer, fileName: string, fileId: string): Promise<AnalysisResult> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    const javascriptElements: JavaScriptElement[] = [];
    const externalHyperlinks: ExternalHyperlink[] = [];
    const warnings: string[] = [];

    // Analyze each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;

      try {
        // Get annotations (which include JavaScript actions)
        const annotations = page.node.Annots();

        if (annotations) {
          const annotsArray = pdfDoc.context.lookup(annotations) as PDFArray;

          if (annotsArray && annotsArray.asArray) {
            const annots = annotsArray.asArray();

            for (let annotIndex = 0; annotIndex < annots.length; annotIndex++) {
              const annotRef = annots[annotIndex];
              const annot = pdfDoc.context.lookup(annotRef) as PDFDict;

              if (!annot || !annot.dict) continue;

              // Check for JavaScript actions
              const action = annot.lookup(PDFName.of('A'));
              if (action && action instanceof PDFDict) {
                const jsElement = this.extractJavaScriptAction(
                  action,
                  pageNumber,
                  annotIndex,
                  pdfDoc
                );
                if (jsElement) {
                  javascriptElements.push(jsElement);
                }
              }

              // Check for additional actions (like mouse events)
              const additionalActions = annot.lookup(PDFName.of('AA'));
              if (additionalActions && additionalActions instanceof PDFDict) {
                const aaElements = this.extractAdditionalActions(
                  additionalActions,
                  pageNumber,
                  annotIndex,
                  pdfDoc
                );
                javascriptElements.push(...aaElements);
              }

              // Check for hyperlinks
              const subtype = annot.lookup(PDFName.of('Subtype'));
              if (subtype && subtype.toString() === '/Link') {
                const hyperlink = this.extractHyperlink(annot, pageNumber, annotIndex, pdfDoc);
                if (hyperlink) {
                  externalHyperlinks.push(hyperlink);
                }
              }
            }
          }
        }

        // Check document-level JavaScript
        const catalog = pdfDoc.catalog;
        const names = catalog.lookup(PDFName.of('Names'));
        if (names && names instanceof PDFDict) {
          const javascript = names.lookup(PDFName.of('JavaScript'));
          if (javascript) {
            warnings.push('Document contains document-level JavaScript that may not be compatible with SharePoint');
          }
        }

      } catch (error) {
        warnings.push(`Error analyzing page ${pageNumber}: ${error.message}`);
      }
    }

    return {
      hasJavaScript: javascriptElements.length > 0,
      javascriptElements,
      externalHyperlinks,
      totalPages,
      fileName,
      fileId,
      warnings
    };
  }

  /**
   * Extracts JavaScript action from an action dictionary
   */
  private static extractJavaScriptAction(
    action: PDFDict,
    page: number,
    annotationIndex: number,
    pdfDoc: PDFDocument
  ): JavaScriptElement | null {
    const actionType = action.lookup(PDFName.of('S'));

    if (!actionType) return null;

    const actionTypeStr = actionType.toString();

    // JavaScript action
    if (actionTypeStr === '/JavaScript') {
      const js = action.lookup(PDFName.of('JS'));
      let code = '';

      if (js instanceof PDFString || js instanceof PDFHexString) {
        code = js.decodeText();
      }

      const element: JavaScriptElement = {
        page,
        type: this.categorizeJavaScript(code),
        action: 'JavaScript',
        code,
        canConvertToHyperlink: false,
        annotationIndex
      };

      // Check if this is a navigation action that can be converted
      const navigationInfo = this.parseNavigationJavaScript(code);
      if (navigationInfo) {
        element.canConvertToHyperlink = true;
        element.targetPage = navigationInfo.targetPage;
        element.targetUrl = navigationInfo.targetUrl;
      }

      return element;
    }

    // GoTo action (page navigation)
    if (actionTypeStr === '/GoTo') {
      const dest = action.lookup(PDFName.of('D'));
      return {
        page,
        type: 'navigation',
        action: 'GoTo',
        code: 'Page navigation',
        canConvertToHyperlink: true,
        annotationIndex
      };
    }

    // URI action (external link)
    if (actionTypeStr === '/URI') {
      const uri = action.lookup(PDFName.of('URI'));
      let url = '';
      if (uri instanceof PDFString || uri instanceof PDFHexString) {
        url = uri.decodeText();
      }

      return {
        page,
        type: 'navigation',
        action: 'URI',
        code: `External link: ${url}`,
        canConvertToHyperlink: true,
        targetUrl: url,
        annotationIndex
      };
    }

    // Named action
    if (actionTypeStr === '/Named') {
      const name = action.lookup(PDFName.of('N'));
      const nameStr = name?.toString() || '';

      return {
        page,
        type: 'navigation',
        action: `Named: ${nameStr}`,
        code: `Named action: ${nameStr}`,
        canConvertToHyperlink: nameStr.includes('NextPage') || nameStr.includes('PrevPage'),
        annotationIndex
      };
    }

    return null;
  }

  /**
   * Extracts additional actions (like mouse events)
   */
  private static extractAdditionalActions(
    aa: PDFDict,
    page: number,
    annotationIndex: number,
    pdfDoc: PDFDocument
  ): JavaScriptElement[] {
    const elements: JavaScriptElement[] = [];
    const events = ['E', 'X', 'D', 'U', 'Fo', 'Bl', 'PO', 'PC', 'PV', 'PI'];
    const eventNames: Record<string, string> = {
      'E': 'MouseEnter',
      'X': 'MouseExit',
      'D': 'MouseDown',
      'U': 'MouseUp',
      'Fo': 'Focus',
      'Bl': 'Blur',
      'PO': 'PageOpen',
      'PC': 'PageClose',
      'PV': 'PageVisible',
      'PI': 'PageInvisible'
    };

    for (const event of events) {
      const eventAction = aa.lookup(PDFName.of(event));
      if (eventAction && eventAction instanceof PDFDict) {
        const jsElement = this.extractJavaScriptAction(eventAction, page, annotationIndex, pdfDoc);
        if (jsElement) {
          jsElement.type = event.startsWith('P') ? jsElement.type : 'mouseover';
          jsElement.action = `${eventNames[event] || event}: ${jsElement.action}`;
          elements.push(jsElement);
        }
      }
    }

    return elements;
  }

  /**
   * Extracts hyperlink information
   */
  private static extractHyperlink(
    annot: PDFDict,
    page: number,
    annotationIndex: number,
    pdfDoc: PDFDocument
  ): ExternalHyperlink | null {
    const action = annot.lookup(PDFName.of('A'));

    if (action && action instanceof PDFDict) {
      const actionType = action.lookup(PDFName.of('S'));

      if (actionType && actionType.toString() === '/URI') {
        const uri = action.lookup(PDFName.of('URI'));
        let url = '';

        if (uri instanceof PDFString || uri instanceof PDFHexString) {
          url = uri.decodeText();
        }

        if (url) {
          return {
            page,
            url,
            annotationIndex
          };
        }
      }
    }

    return null;
  }

  /**
   * Categorizes JavaScript code by type
   */
  private static categorizeJavaScript(code: string): JavaScriptElement['type'] {
    const lowerCode = code.toLowerCase();

    if (lowerCode.includes('alert') || lowerCode.includes('popup')) {
      return 'popup';
    }
    if (lowerCode.includes('mouse') || lowerCode.includes('hover')) {
      return 'mouseover';
    }
    if (lowerCode.includes('pagenum') || lowerCode.includes('goto') ||
        lowerCode.includes('nextpage') || lowerCode.includes('prevpage')) {
      return 'navigation';
    }
    if (lowerCode.includes('field') || lowerCode.includes('form')) {
      return 'form';
    }

    return 'other';
  }

  /**
   * Attempts to parse navigation JavaScript to extract target
   */
  private static parseNavigationJavaScript(code: string): { targetPage?: number; targetUrl?: string } | null {
    // Look for page number patterns
    const pageNumMatch = code.match(/pageNum\s*=\s*(\d+)/i);
    if (pageNumMatch) {
      return { targetPage: parseInt(pageNumMatch[1], 10) };
    }

    // Look for GoTo patterns
    const gotoMatch = code.match(/this\.pageNum\s*=\s*(\d+)/i);
    if (gotoMatch) {
      return { targetPage: parseInt(gotoMatch[1], 10) };
    }

    // Look for URL patterns
    const urlMatch = code.match(/app\.launchURL\(['"]([^'"]+)['"]/i);
    if (urlMatch) {
      return { targetUrl: urlMatch[1] };
    }

    return null;
  }
}
