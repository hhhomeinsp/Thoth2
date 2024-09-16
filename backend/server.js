import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fsPromises from 'fs/promises';
import { spawn } from 'child_process';
import { convertToHtml, replaceHtmlPlaceholders } from './documentUtils.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 5010;

// Utility function for file type detection
function detectFileType(filename, metadataType = null) {
  if (metadataType) {
    return metadataType;
  }

  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc':
      return 'application/msword';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

// Consolidated CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3005',
    'http://localhost:3000',
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Consolidated middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/Documents', express.static(path.join(__dirname, '..', 'Documents')));
app.use(
  '/Placeholders',
  express.static(path.join(__dirname, '..', 'Placeholders'))
);
app.use(express.static(path.join(__dirname, '..', 'build')));

// Ensure directories exist
(async () => {
  for (const dir of [
    'Documents',
    'Placeholders',
    'temp',
    'Processed Documents',
  ]) {
    try {
      await fsPromises.access(path.join(__dirname, '..', dir));
    } catch {
      await fsPromises.mkdir(path.join(__dirname, '..', dir), {
        recursive: true,
      });
    }
  }
})();

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'Documents'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed!'));
    }
  },
});

// Consolidated server startup process
const startServer = (portToUse = port) => {
  const server = app
    .listen(portToUse, '0.0.0.0', () => {
      console.log(
        `Server running on http://localhost:${server.address().port}`
      );
      console.log(
        'CORS-enabled web server listening on port',
        server.address().port
      );
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${portToUse} is busy, trying the next one...`);
        startServer(portToUse + 1);
      } else {
        console.error('Server error:', err);
      }
    });

  process.on('SIGINT', () => {
    console.log('Shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
};

// Consolidated '/api/test' route
app.get('/api/test', (req, res) => {
  console.log('Received request for /api/test');
  res.json({ message: 'Server is responding' });
});

// Helper function to check if file exists
async function fileExists(filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// File upload route with improved error handling
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const fileBuffer = await fsPromises.readFile(req.file.path);
    const htmlFileName = `${path.parse(req.file.filename).name}.html`;
    const htmlFilePath = path.join(__dirname, '..', 'Documents', htmlFileName);

    let htmlContent = await convertToHtml({
      arrayBuffer: async () => fileBuffer,
      type: req.file.mimetype,
      path: req.file.path, // Pass the file path for PDF conversion
    });

    await fsPromises.writeFile(htmlFilePath, htmlContent);

    // Save metadata
    const metadataFileName = `${path
      .parse(req.file.filename)
      .name}_metadata.json`;
    const metadataFilePath = path.join(
      __dirname,
      '..',
      'Documents',
      metadataFileName
    );
    await fsPromises.writeFile(
      metadataFilePath,
      JSON.stringify(
        {
          originalType: req.file.mimetype,
          originalName: req.file.originalname,
        },
        null,
        2
      )
    );

    res.json({
      message: 'File uploaded and converted successfully',
      file: req.file,
    });
  } catch (error) {
    console.error('Error processing uploaded file:', error);
    res.status(500).json({
      message: 'Error processing uploaded file',
      error: error.message,
    });
  }
});

// Fetch converted document content
app.get('/api/convert-document/:filename', async (req, res) => {
  const filename = req.params.filename;
  const htmlFileName = `${path.parse(filename).name}.html`;
  const htmlFilePath = path.join(__dirname, '..', 'Documents', htmlFileName);

  console.log(`Fetching converted document: ${htmlFilePath}`);

  try {
    // Check if the HTML file exists
    await fsPromises.access(htmlFilePath);
    console.log(`HTML file exists: ${htmlFilePath}`);

    // Read the HTML content
    const content = await fsPromises.readFile(htmlFilePath, 'utf8');
    console.log(`HTML content read successfully`);

    // Detect the file type
    const metadataPath = path.join(
      __dirname,
      '..',
      'Documents',
      `${path.parse(filename).name}_metadata.json`
    );
    let metadata = {};
    if (await fileExists(metadataPath)) {
      metadata = JSON.parse(await fsPromises.readFile(metadataPath, 'utf8'));
    }
    const fileType = 'text/html'; // Set fileType to 'text/html'

    res.json({
      message: 'Document fetched successfully',
      content,
      fileType,
    });
  } catch (error) {
    console.error('Error fetching converted document:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'HTML file not found', details: error.message });
    } else {
      res.status(500).json({ error: 'Error fetching document', details: error.message });
    }
  }
});


// Fetch placeholders API route
app.get('/api/placeholders/:fileName', async (req, res) => {
  const fileName = req.params.fileName;
  const placeholdersFileName = `${fileName.split('.')[0]}_analysis.json`;
  const placeholdersFilePath = path.join(
    __dirname,
    '..',
    'Placeholders',
    placeholdersFileName
  );

  try {
    let placeholdersData;
    if (await fileExists(placeholdersFilePath)) {
      placeholdersData = JSON.parse(
        await fsPromises.readFile(placeholdersFilePath, 'utf8')
      );
      console.log('Placeholders data read from file:', placeholdersData);
    } else {
      console.log('Placeholders file not found:', placeholdersFilePath);
      // Create an empty placeholders file if not found
      const emptyPlaceholders = { analysis: { placeholders: [] } };
      await fsPromises.writeFile(
        placeholdersFilePath,
        JSON.stringify(emptyPlaceholders, null, 2)
      );
      placeholdersData = emptyPlaceholders;
    }
    res.json(placeholdersData);
  } catch (error) {
    console.error('Error reading or creating placeholders file:', error);
    res
      .status(500)
      .json({ error: 'Error reading or creating placeholders file' });
  }
});

app.post('/api/process-document', async (req, res) => {
  const { fileName, placeholders } = req.body;

  // Construct the path to the HTML file
  const htmlFileName = `${path.parse(fileName).name}.html`;
  const filePath = path.join(__dirname, '..', 'Documents', htmlFileName);

  console.log(`Attempting to process HTML file: ${filePath}`);

  try {
    // Check if file exists
    await fsPromises.access(filePath);
    console.log(`HTML file exists: ${filePath}`);

    // Read the HTML content
    let content = await fsPromises.readFile(filePath, 'utf8');
    console.log(`HTML content read successfully`);

    // Replace placeholders in the content
    content = replaceHtmlPlaceholders(content, placeholders);
    console.log(`Placeholders replaced in HTML content`);

    // Create a new file with the processed content
    const processedFileName = `processed_${htmlFileName}`;
    const processedDirPath = path.join(__dirname, '..', 'Processed Documents');

    // Ensure the processed documents directory exists
    await fsPromises.mkdir(processedDirPath, { recursive: true });

    const processedFilePath = path.join(processedDirPath, processedFileName);
    await fsPromises.writeFile(processedFilePath, content);
    console.log(`Processed HTML file saved: ${processedFilePath}`);

    res.json({
      message: 'HTML document processed successfully',
      processedContent: content,
    });
  } catch (error) {
    console.error('Error processing HTML document:', error);
    if (error.code === 'ENOENT') {
      res
        .status(404)
        .json({ error: 'HTML file not found', details: error.message });
    } else {
      res
        .status(500)
        .json({
          error: 'Error processing HTML document',
          details: error.message,
        });
    }
  }
});

// Add Placeholder API route
app.post('/api/add-placeholder', async (req, res) => {
  const { fileName, placeholder } = req.body;
  if (!fileName || !placeholder) {
    return res
      .status(400)
      .json({ error: 'File name and placeholder are required.' });
  }

  const placeholdersFileName = `${fileName.split('.')[0]}_analysis.json`;
  const placeholdersFilePath = path.join(
    __dirname,
    '..',
    'Placeholders',
    placeholdersFileName
  );

  try {
    // Read the existing placeholders
    let existingData = { analysis: { placeholders: [] } };
    if (await fileExists(placeholdersFilePath)) {
      existingData = JSON.parse(
        await fsPromises.readFile(placeholdersFilePath, 'utf8')
      );
    }

    // Add the new placeholder if it doesn't already exist
    const placeholderExists = existingData.analysis.placeholders.some(
      (p) => p.placeholder === placeholder.placeholder
    );

    if (!placeholderExists) {
      existingData.analysis.placeholders.push(placeholder);
    } else {
      return res.status(400).json({ error: 'Placeholder already exists.' });
    }

    // Write the updated data back to the file
    await fsPromises.writeFile(
      placeholdersFilePath,
      JSON.stringify(existingData, null, 2)
    );
    console.log('Placeholder added:', placeholdersFileName);
    res.json({
      message: 'Placeholder added successfully',
      file: placeholdersFileName,
    });
  } catch (error) {
    console.error('Error adding placeholder:', error);
    res.status(500).json({ error: 'Failed to add placeholder' });
  }
});

// Save placeholders route
app.post('/api/save-placeholders', async (req, res) => {
  const { fileName, placeholders } = req.body;
  if (!fileName || !placeholders) {
    return res
      .status(400)
      .json({ error: 'File name and placeholders are required.' });
  }

  const placeholdersFileName = `${fileName.split('.')[0]}_analysis.json`;
  const placeholdersFilePath = path.join(
    __dirname,
    '..',
    'Placeholders',
    placeholdersFileName
  );

  try {
    // Read the existing file
    const existingData = JSON.parse(
      await fsPromises.readFile(placeholdersFilePath, 'utf8')
    );

    // Update the placeholders
    existingData.analysis.placeholders = existingData.analysis.placeholders.map(
      (existingPlaceholder) => {
        const updatedPlaceholder =
          placeholders[existingPlaceholder.placeholder];
        if (updatedPlaceholder) {
          return {
            ...existingPlaceholder,
            description:
              updatedPlaceholder.description ||
              existingPlaceholder.description,
            explanation:
              updatedPlaceholder.explanation ||
              existingPlaceholder.explanation,
            newValue:
              updatedPlaceholder.newValue || existingPlaceholder.newValue,
          };
        }
        return existingPlaceholder;
      }
    );

    // Write the updated data back to the file
    await fsPromises.writeFile(
      placeholdersFilePath,
      JSON.stringify(existingData, null, 2)
    );
    console.log('Placeholders autosaved:', placeholdersFileName);
    res.json({
      message: 'Placeholders autosaved successfully',
      file: placeholdersFileName,
    });
  } catch (error) {
    console.error('Error autosaving placeholders:', error);
    res.status(500).json({ error: 'Failed to autosave placeholders' });
  }
});

// Delete files route
app.delete('/api/files/:filename', async (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const baseFilePath = path.join(
    __dirname,
    '..',
    'Documents',
    path.parse(filename).name
  );

  try {
    // Delete original file
    await fsPromises
      .unlink(`${baseFilePath}${path.extname(filename)}`)
      .catch(() => {});

    // Delete HTML file
    await fsPromises.unlink(`${baseFilePath}.html`).catch(() => {});

    // Delete metadata file
    await fsPromises.unlink(`${baseFilePath}_metadata.json`).catch(() => {});

    res.json({ message: 'Files deleted successfully' });
  } catch (err) {
    console.error('Error deleting files:', err);
    res.status(500).json({ message: 'Error deleting files' });
  }
});

// Serve PDF files directly
app.get('/api/pdf/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'Documents', filename);

  if (!(await fileExists(filePath))) {
    return res.status(404).json({ error: 'PDF file not found' });
  }

  res.contentType('application/pdf');
  const fileStream = await fsPromises.readFile(filePath);
  res.send(fileStream);
});

// Update the /api/files route to include PDF preview information
app.get('/api/files', async (req, res) => {
  console.log('Received request for /api/files');
  const documentsPath = path.join(__dirname, '..', 'Documents');
  console.log('Reading files from:', documentsPath);

  try {
    const files = await fsPromises.readdir(documentsPath);
    console.log('Raw files list:', files);
    if (files.length === 0) {
      console.log('No files found in the directory');
      return res.json([]);
    }

    const fileList = await Promise.all(
      files
        .filter(
          (file) =>
            !file.endsWith('_metadata.json') &&
            !file.startsWith('processed_') &&
            !file.endsWith('.html') // Exclude HTML files from the list
        )
        .map(async (file, index) => {
          const filePath = path.join(documentsPath, file);
          const stats = await fsPromises.stat(filePath);
          const metadataPath = path.join(
            documentsPath,
            `${path.parse(file).name}_metadata.json`
          );
          let metadata = {};
          if (await fileExists(metadataPath)) {
            metadata = JSON.parse(
              await fsPromises.readFile(metadataPath, 'utf-8')
            );
          }
          const isPdf =
            detectFileType(file, metadata.originalType) === 'application/pdf';
          return {
            id: index + 1,
            name: file,
            originalName: metadata.originalName || file,
            path: `/Documents/${file}`,
            url: isPdf ? `/api/pdf/${file}` : `/Documents/${file}`,
            previewUrl: `/Documents/${path.parse(file).name}.html`,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            type: metadata.originalType || 'application/octet-stream',
          };
        })
    );

    console.log('Sending file list:', fileList);
    res.json(fileList);
  } catch (err) {
    console.error('Error reading files:', err);
    res
      .status(500)
      .json({ message: 'Error reading files', error: err.message });
  }
});

// Fetch processed document content
app.get('/api/get-processed-document', async (req, res) => {
  const { filePath } = req.query;

  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading processed document:', error);
    res.status(500).json({
      error: 'Error reading processed document',
      details: error.message,
    });
  }
});

// Route to analyze documents using the Python script
app.post('/api/analyze-document', async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    console.error('File name is missing in the request');
    return res.status(400).json({ error: 'File name is required.' });
  }

  console.log('Analyzing document:', fileName);
  const filePath = path.join(__dirname, '..', 'Documents', fileName);

  try {
    if (!(await fileExists(filePath))) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'File not found.' });
    }

    const pythonScriptPath = path.join(__dirname, 'analyze_utils.py');
    console.log('Spawning Python process:', pythonScriptPath);

    const pythonProcess = spawn('python3', [
      pythonScriptPath,
      fileName,
      filePath,
    ]);

    let pythonOutput = '';
    let pythonError = '';

    pythonProcess.stdout.on('data', (data) => {
      console.log('Python script output:', data.toString());
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python script error:', data.toString());
      pythonError += data.toString();
    });

    pythonProcess.on('close', async (code) => {
      console.log('Python process closed with code:', code);
      if (code !== 0) {
        console.error('Python script error:', pythonError);
        return res
          .status(500)
          .json({ error: 'Error analyzing document', details: pythonError });
      }

      try {
        console.log('Parsing Python script output');
        console.log('Raw Python output:', pythonOutput);

        const [result, parseError] = safeJSONParse(pythonOutput);

        if (parseError) {
          throw new Error('Invalid JSON structure in Python script output');
        }

        if (!result || !result.analysis || !result.analysis.placeholders) {
          throw new Error('Invalid JSON structure: missing required fields');
        }

        const placeholders = result.analysis.placeholders;

        // Save the placeholders to a JSON file
        const placeholdersFileName = `${fileName.split('.')[0]}_analysis.json`;
        const placeholdersFilePath = path.join(
          __dirname,
          '..',
          'Placeholders',
          placeholdersFileName
        );
        console.log('Saving placeholders to:', placeholdersFilePath);
        await fsPromises.writeFile(
          placeholdersFilePath,
          JSON.stringify({ analysis: { placeholders } }, null, 2)
        );

        console.log('Document analyzed successfully:', fileName);
        res.json({
          message: 'Document analyzed successfully',
          placeholders,
        });
      } catch (parseError) {
        console.error('Error parsing Python script output:', parseError);
        res.status(500).json({
          error: 'Error parsing analysis result',
          details: parseError.message,
          rawOutput: pythonOutput,
        });
      }
    });
  } catch (error) {
    console.error('Error analyzing document:', error);
    res
      .status(500)
      .json({ error: 'Error analyzing document', details: error.message });
  }
});

// Helper function for safe JSON parsing
function safeJSONParse(str) {
  try {
    return [JSON.parse(str), null];
  } catch (error) {
    console.error('Error parsing JSON:', error);
    // Try to match potential JSON block from string
    const match = str.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return [JSON.parse(match[0]), null];
      } catch (innerError) {
        console.error('Error parsing matched JSON:', innerError);
        return [null, innerError];
      }
    }
    return [null, error];
  }
}

// Catch-all route for handling other requests
app.get('*', async (req, res) => {
  const indexPath = path.join(__dirname, '..', 'build', 'index.html');
  if (await fileExists(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res
      .status(404)
      .send('Not found. Make sure to build the React app first.');
  }
});

// Start the server
startServer();
