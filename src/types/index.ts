export interface JavaScriptElement {
  page: number;
  type: 'navigation' | 'popup' | 'mouseover' | 'form' | 'other';
  action: string;
  code: string;
  canConvertToHyperlink: boolean;
  targetPage?: number;
  targetUrl?: string;
  fieldName?: string;
  annotationIndex?: number;
}

export interface ExternalHyperlink {
  page: number;
  url: string;
  annotationIndex?: number;
}

export interface AnalysisResult {
  hasJavaScript: boolean;
  javascriptElements: JavaScriptElement[];
  externalHyperlinks: ExternalHyperlink[];
  totalPages: number;
  fileName: string;
  fileId: string;
  warnings: string[];
}

export interface ConversionRequest {
  fileId: string;
  conversions: ConversionMapping[];
}

export interface ConversionMapping {
  elementIndex: number;
  action: 'convert' | 'remove' | 'keep';
  targetPage?: number;
  targetUrl?: string;
}

export interface ConversionResult {
  success: boolean;
  fileId: string;
  downloadUrl?: string;
  errors?: string[];
  convertedElements: number;
  removedElements: number;
}
