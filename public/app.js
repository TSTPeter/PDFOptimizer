// Configuration
const API_BASE_URL = window.location.origin + '/api';

// State
let currentFile = null;
let analysisResult = null;
let elementMappings = {};

// DOM Elements
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const analyzeBtn = document.getElementById('analyze-btn');
const loading = document.getElementById('loading');
const analysisSection = document.getElementById('analysis-section');
const analysisResults = document.getElementById('analysis-results');
const convertSection = document.getElementById('convert-section');
const convertBtn = document.getElementById('convert-btn');
const convertLoading = document.getElementById('convert-loading');
const convertResults = document.getElementById('convert-results');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

function setupEventListeners() {
  // File upload
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('dragleave', handleDragLeave);
  uploadArea.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);

  // Analyze button
  analyzeBtn.addEventListener('click', analyzePDF);

  // Convert button
  convertBtn.addEventListener('click', convertPDF);

  // Download button
  downloadBtn.addEventListener('click', downloadPDF);

  // Reset button
  resetBtn.addEventListener('click', resetApp);
}

// File handling
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please select a PDF file');
    return;
  }

  currentFile = file;

  // Display file info
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);

  uploadArea.classList.add('hidden');
  fileInfo.classList.remove('hidden');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Analyze PDF
async function analyzePDF() {
  if (!currentFile) return;

  loading.classList.remove('hidden');
  analyzeBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', currentFile);

    const response = await fetch(`${API_BASE_URL}/uploadAnalyze`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to analyze PDF');
    }

    analysisResult = await response.json();
    displayAnalysisResults();

    // Show analysis section
    analysisSection.classList.add('active');
    convertSection.classList.add('active');

    // Scroll to analysis
    analysisSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Error analyzing PDF:', error);
    alert('An error occurred while analyzing the PDF. Please try again.');
  } finally {
    loading.classList.add('hidden');
    analyzeBtn.disabled = false;
  }
}

// Display analysis results
function displayAnalysisResults() {
  const { javascriptElements, externalHyperlinks, totalPages, warnings } = analysisResult;

  let html = '<div class="analysis-summary">';
  html += '<h3>Analysis Summary</h3>';
  html += '<div class="summary-grid">';
  html += `
    <div class="summary-item">
      <div class="summary-number">${totalPages}</div>
      <div class="summary-label">Total Pages</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${javascriptElements.length}</div>
      <div class="summary-label">JavaScript Elements</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${externalHyperlinks.length}</div>
      <div class="summary-label">External Links</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${javascriptElements.filter(e => e.canConvertToHyperlink).length}</div>
      <div class="summary-label">Convertible Elements</div>
    </div>
  `;
  html += '</div>';
  html += '</div>';

  // Warnings
  if (warnings && warnings.length > 0) {
    html += '<div class="warning-box">';
    html += '<strong>Warnings:</strong><ul>';
    warnings.forEach(warning => {
      html += `<li>${warning}</li>`;
    });
    html += '</ul></div>';
  }

  // JavaScript elements
  if (javascriptElements.length > 0) {
    html += '<div class="element-list">';
    html += '<h3>JavaScript Elements Found</h3>';

    javascriptElements.forEach((element, index) => {
      elementMappings[index] = {
        action: element.canConvertToHyperlink ? 'convert' : 'remove',
        targetPage: element.targetPage,
        targetUrl: element.targetUrl
      };

      html += `<div class="element-item">`;
      html += `<div class="element-header">`;
      html += `<div>`;
      html += `<span class="element-type ${element.type}">${element.type}</span>`;
      html += `<span class="badge ${element.canConvertToHyperlink ? 'badge-success' : 'badge-danger'}">
                ${element.canConvertToHyperlink ? 'Convertible' : 'Not Convertible'}
               </span>`;
      html += `</div>`;
      html += `<span>Page ${element.page}</span>`;
      html += `</div>`;

      html += `<div class="element-info">`;
      html += `<p><strong>Action:</strong> ${element.action}</p>`;
      if (element.targetPage) {
        html += `<p><strong>Target:</strong> Page ${element.targetPage}</p>`;
      }
      if (element.targetUrl) {
        html += `<p><strong>URL:</strong> ${element.targetUrl}</p>`;
      }
      html += `</div>`;

      html += `<div class="element-code">${escapeHtml(element.code)}</div>`;

      html += `<div class="element-actions">`;
      html += `<select id="action-${index}" onchange="updateElementAction(${index})">`;

      if (element.canConvertToHyperlink) {
        html += `<option value="convert">Convert to Hyperlink</option>`;
        html += `<option value="remove">Remove</option>`;
        html += `<option value="keep">Keep (Not Recommended)</option>`;
      } else {
        html += `<option value="remove">Remove</option>`;
        html += `<option value="keep">Keep (Not Recommended)</option>`;
      }

      html += `</select>`;

      if (element.canConvertToHyperlink && element.type === 'navigation') {
        if (element.targetPage) {
          html += `<input type="number" id="target-${index}" value="${element.targetPage}"
                   placeholder="Target page" min="1" max="${totalPages}"
                   onchange="updateElementTarget(${index})">`;
        } else if (element.targetUrl) {
          html += `<input type="text" id="target-${index}" value="${element.targetUrl}"
                   placeholder="Target URL" onchange="updateElementTarget(${index})">`;
        } else {
          html += `<input type="number" id="target-${index}" value=""
                   placeholder="Target page (optional)" min="1" max="${totalPages}"
                   onchange="updateElementTarget(${index})">`;
        }
      }

      html += `</div>`;
      html += `</div>`;
    });

    html += '</div>';
  }

  // External hyperlinks (preserved)
  if (externalHyperlinks.length > 0) {
    html += '<div class="element-list mt-2">';
    html += '<h3>External Hyperlinks (Will be preserved)</h3>';

    externalHyperlinks.forEach(link => {
      html += `<div class="element-item">`;
      html += `<div class="element-header">`;
      html += `<span class="element-type navigation">External Link</span>`;
      html += `<span>Page ${link.page}</span>`;
      html += `</div>`;
      html += `<p><strong>URL:</strong> ${link.url}</p>`;
      html += `</div>`;
    });

    html += '</div>';
  }

  if (javascriptElements.length === 0 && externalHyperlinks.length === 0) {
    html += '<div class="text-center mt-2">';
    html += '<p>No JavaScript elements or hyperlinks found in this PDF.</p>';
    html += '<p>This PDF should already be compatible with SharePoint.</p>';
    html += '</div>';
  }

  analysisResults.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateElementAction(index) {
  const select = document.getElementById(`action-${index}`);
  elementMappings[index].action = select.value;
}

function updateElementTarget(index) {
  const input = document.getElementById(`target-${index}`);
  const value = input.value;

  if (input.type === 'number') {
    elementMappings[index].targetPage = parseInt(value, 10);
  } else {
    elementMappings[index].targetUrl = value;
  }
}

// Convert PDF
async function convertPDF() {
  if (!analysisResult) return;

  convertLoading.classList.remove('hidden');
  convertBtn.disabled = true;

  try {
    const conversions = Object.keys(elementMappings).map(key => ({
      elementIndex: parseInt(key, 10),
      ...elementMappings[key]
    }));

    const response = await fetch(`${API_BASE_URL}/convertPDF`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: analysisResult.fileId,
        conversions
      })
    });

    if (!response.ok) {
      throw new Error('Failed to convert PDF');
    }

    const result = await response.json();
    displayConversionResults(result);

    convertResults.classList.remove('hidden');
    convertResults.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Error converting PDF:', error);
    alert('An error occurred while converting the PDF. Please try again.');
  } finally {
    convertLoading.classList.add('hidden');
    convertBtn.disabled = false;
  }
}

function displayConversionResults(result) {
  const summary = document.getElementById('conversion-summary');
  summary.textContent = `Successfully converted ${result.convertedElements} elements and removed ${result.removedElements} incompatible elements.`;

  // Store download info
  downloadBtn.dataset.fileId = result.fileId;
  downloadBtn.dataset.fileName = analysisResult.fileName.replace('.pdf', '_converted.pdf');
}

// Download PDF
async function downloadPDF() {
  const fileId = downloadBtn.dataset.fileId;
  const fileName = downloadBtn.dataset.fileName;

  if (!fileId || !fileName) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/downloadPDF?fileId=${fileId}&fileName=${fileName}`
    );

    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (error) {
    console.error('Error downloading PDF:', error);
    alert('An error occurred while downloading the PDF. Please try again.');
  }
}

// Reset app
function resetApp() {
  currentFile = null;
  analysisResult = null;
  elementMappings = {};

  uploadArea.classList.remove('hidden');
  fileInfo.classList.add('hidden');
  loading.classList.add('hidden');
  analysisSection.classList.remove('active');
  convertSection.classList.remove('active');
  convertResults.classList.add('hidden');

  fileInput.value = '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
