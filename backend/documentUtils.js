import mammoth from 'mammoth';
import fs from 'fs/promises';
import { createCanvas } from 'canvas';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import sanitizeHtml from 'sanitize-html';
import { JSDOM } from 'jsdom';

if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

async function convertToHtml(file, annotations = []) {
  try {
    console.log('Starting conversion to HTML');
    const buffer = await getFileBuffer(file);
    console.log('File buffer obtained');
    const fileType = file.type || file.mimetype;
    console.log('File type:', fileType);
    let html = await convertBufferToHtml(buffer, fileType);
    console.log('Buffer converted to HTML');
    return addAnnotationsToHtml(html, annotations);
  } catch (error) {
    console.error('Error in convertToHtml:', error);
    throw new Error(`HTML conversion failed: ${error.message}`);
  }
}

async function getFileBuffer(file) {
  try {
    if (file.arrayBuffer) {
      return await file.arrayBuffer();
    } else if (file.path) {
      return await fs.readFile(file.path);
    }
    throw new Error('Invalid file object');
  } catch (error) {
    console.error('Error in getFileBuffer:', error);
    throw new Error(`Failed to get file buffer: ${error.message}`);
  }
}

async function convertBufferToHtml(buffer, fileType) {
  console.log(`Converting ${fileType} to HTML`);
  try {
    switch (fileType) {
      case 'application/pdf':
        return await convertPdfToHtml(buffer);
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await convertDocToHtml(buffer);
      case 'text/plain':
        return await convertTxtToHtml(buffer);
      default:
        throw new UnsupportedFileTypeError(fileType);
    }
  } catch (error) {
    console.error(`Error converting ${fileType} to HTML:`, error);
    throw new Error(`Failed to convert ${fileType} to HTML: ${error.message}`);
  }
}

async function convertPdfToHtml(buffer) {
  try {
    console.log('Starting PDF conversion');
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    console.log(`PDF loaded, ${pdf.numPages} pages found`);
    
    let html = '<div class="pdf-document">';
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`Processing page ${pageNum}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      
      const textContent = await page.getTextContent();
      
      html += `
        <div class="pdf-page" style="width:${viewport.width}px;height:${viewport.height}px;position:relative;margin-bottom:20px;">
      `;
      
      // Process text elements
      const textItems = processTextItems(textContent, viewport);
      html += renderTextItems(textItems);
      
      html += '</div>';
    }
    
    html += '</div>';
    console.log('PDF conversion completed');
    return addPdfStyles(html);
  } catch (error) {
    console.error('Error in PDF conversion:', error);
    throw new Error(`PDF conversion failed: ${error.message}`);
  }
}

function processTextItems(textContent, viewport) {
  return textContent.items.map(item => {
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const fontHeight = Math.sqrt((item.transform[2] * item.transform[2]) + (item.transform[3] * item.transform[3]));
    const angle = Math.atan2(item.transform[1], item.transform[0]) * (180 / Math.PI);
    
    return {
      text: item.str,
      x: x,
      y: viewport.height - y, // Flip y-coordinate
      fontSize: fontHeight,
      fontFamily: item.fontName || 'Arial, sans-serif',
      color: item.color ? rgbToHex(item.color) : '#000000',
      angle: angle
    };
  });
}

function renderTextItems(textItems) {
  return textItems.map(item => `
    <div style="
      position:absolute;
      left:${item.x}px;
      top:${item.y}px;
      font-size:${item.fontSize}px;
      font-family:${item.fontFamily};
      color:${item.color};
      transform:rotate(${item.angle}deg);
      transform-origin:left top;
      white-space:pre;
    ">${escapeHtml(item.text)}</div>
  `).join('');
}

function addPdfStyles(html) {
  return `
    <style>
      .pdf-document {
        background-color: #ffffff;
        padding: 20px;
        font-family: Arial, sans-serif;
      }
      .pdf-page {
        border: 1px solid #ddd;
        margin: 0 auto 20px auto;
        position: relative;
        overflow: hidden;
      }
    </style>
  ` + html;
}

function rgbToHex(rgb) {
  return '#' + rgb.map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export { convertPdfToHtml };

async function convertDocToHtml(buffer) {
  try {
    console.log('Starting DOC/DOCX conversion');
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "r[style-name='Strong'] => strong",
          "r[style-name='Emphasis'] => em",
          "p[style-name='List Paragraph'] => li:fresh",
          "table => table",
          "tr => tr",
          "td => td",
          "r[style-name='Hyperlink'] => a"
        ],
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        }),
        ignoreEmptyParagraphs: false
      }
    );
    console.log('DOC/DOCX conversion completed');
    return addDocStyles(result.value);
  } catch (error) {
    console.error('Error in DOC/DOCX conversion:', error);
    throw new Error(`DOC/DOCX conversion failed: ${error.message}`);
  }
}

function addDocStyles(html) {
  return `
    <style>
      .doc-content {
        font-family: 'Calibri', 'Arial', sans-serif;
        line-height: 1.5;
        color: #333;
      }
      .doc-content h1 { font-size: 24px; margin-top: 24px; margin-bottom: 12px; }
      .doc-content h2 { font-size: 20px; margin-top: 20px; margin-bottom: 10px; }
      .doc-content h3 { font-size: 16px; margin-top: 16px; margin-bottom: 8px; }
      .doc-content p { margin-bottom: 10px; }
      .doc-content table { border-collapse: collapse; margin-bottom: 15px; }
      .doc-content th, .doc-content td { border: 1px solid #ddd; padding: 8px; }
      .doc-content th { background-color: #f2f2f2; }
      .doc-content ul, .doc-content ol { margin-bottom: 10px; padding-left: 20px; }
      .doc-content li { margin-bottom: 5px; }
      .doc-content a { color: #0066cc; text-decoration: underline; }
    </style>
    <div class="doc-content">
  ` + html + '</div>';
}

async function convertTxtToHtml(buffer) {
  try {
    console.log('Starting TXT conversion');
    const text = buffer.toString('utf-8');
    const lines = text.split('\n');
    let html = '<div class="txt-content">';
    
    lines.forEach(line => {
      if (line.trim() === '') {
        html += '<br>';
      } else {
        html += `<p>${escapeHtml(line)}</p>`;
      }
    });
    
    html += '</div>';
    console.log('TXT conversion completed');
    return addTxtStyles(html);
  } catch (error) {
    console.error('Error in TXT conversion:', error);
    throw new Error(`TXT conversion failed: ${error.message}`);
  }
}

function addTxtStyles(html) {
  return `
    <style>
      .txt-content {
        font-family: 'Courier New', monospace;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        background-color: #f5f5f5;
        padding: 15px;
        border-radius: 5px;
      }
      .txt-content p {
        margin: 0 0 10px 0;
      }
    </style>
  ` + html;
}

function addAnnotationsToHtml(html, annotations) {
  try {
    console.log('Adding annotations to HTML');
    annotations.forEach(annotation => {
      const annotationHtml = `<span class="annotation" data-id="${annotation.id}" style="background-color: yellow;">${annotation.text}<span class="annotation-note">${annotation.note}</span></span>`;
      html = html.replace(new RegExp(escapeRegExp(annotation.text), 'g'), annotationHtml);
    });
    return sanitizeHtml(html, {
      allowedTags: ['span', 'div', 'p', 'h1', 'h2', 'h3', 'ul', 'li', 'br', 'pre', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
      allowedAttributes: {
        'span': ['class', 'data-id', 'style'],
        'div': ['class', 'style'],
        'img': ['src', 'alt', 'style'],
        'table': ['style'],
        'td': ['style'],
        'th': ['style']
      }
    });
  } catch (error) {
    console.error('Error adding annotations:', error);
    throw new Error(`Failed to add annotations: ${error.message}`);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceHtmlPlaceholders(content, placeholders) {
  const dom = new JSDOM(content);
  const document = dom.window.document;

  const replaceInNode = (node) => {
    if (node.nodeType === document.TEXT_NODE) {
      Object.entries(placeholders).forEach(([placeholder, newValue]) => {
        const regex = new RegExp(escapeRegExp(placeholder), 'g');
        node.textContent = node.textContent.replace(regex, newValue || placeholder);
      });
    } else if (node.nodeType === document.ELEMENT_NODE) {
      node.childNodes.forEach(replaceInNode);
    }
  };

  replaceInNode(document.body);

  return dom.serialize();
}

class UnsupportedFileTypeError extends Error {
  constructor(fileType) {
    super(`Unsupported file type: ${fileType}`);
    this.name = 'UnsupportedFileTypeError';
  }
}

export { 
  convertToHtml, 
  UnsupportedFileTypeError,
  replaceHtmlPlaceholders
};