import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.js';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry.js';

GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default pdfjsWorker;
