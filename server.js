const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { convertToHtml } = require('./documentUtils');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 5010;

// Correctly resolve paths relative to the project root
const projectRoot = path.resolve(__dirname);
const documentsPath = path.join(projectRoot, 'Documents');
const placeholdersPath = path.join(projectRoot, 'Placeholders');
const processedDocumentsPath = path.join(projectRoot, 'Processed Documents');

app.use(cors({
  origin: ['http://localhost:3005', 'http://localhost:3000', process.env.FRONTEND_URL || 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Add a test route to check if the server is responding
app.get('/api/test', (req, res) => {
  console.log('Received request for /api/test');
  res.json({ message: 'Server is responding' });
});

// Add this line to log when the server starts
console.log(`Server starting on port ${port}`);

// Serve static files from the React app
app.use(express.static(path.join(projectRoot, 'build')));

// Serve files from Documents, Placeholders, and Processed Documents folders
app.use('/Documents', express.static(documentsPath));
app.use('/Placeholders', express.static(placeholdersPath));
app.use('/Processed Documents', express.static(processedDocumentsPath));

// API routes
app.get('/api/documents/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'Documents', filename);
    const fileContent = await fs.readFile(filePath);
    const fileType = path.extname(filename).slice(1);
    
    const htmlContent = await convertToHtml({
      arrayBuffer: async () => fileContent,
      type: `application/${fileType}`
    });

    res.json({
      content: htmlContent,
      fileType: `application/${fileType}`
    });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// New route to get processed document
app.get('/api/processed-documents/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'Processed Documents', filename);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const fileType = path.extname(filename).slice(1);

    res.json({
      content: fileContent,
      fileType: `application/${fileType}`
    });
  } catch (error) {
    console.error('Error fetching processed document:', error);
    res.status(500).json({ error: 'Failed to fetch processed document' });
  }
});

// API route to get files
app.get('/api/files', (req, res) => {
  fs.readdir(documentsPath)
    .then(files => {
      res.status(200).send(files);
    })
    .catch(err => {
      res.status(500).send({
        message: "Unable to scan files!",
        error: err
      });
    });
});

// API route to get a specific file
app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(documentsPath, req.params.filename);
  fs.access(filePath, fs.constants.F_OK)
    .then(() => {
      res.sendFile(filePath);
    })
    .catch(err => {
      res.status(404).send({
        message: "File not found!",
        error: err
      });
    });
});

// API route to delete a file
app.delete('/api/files/:filename', (req, res) => {
  const filePath = path.join(documentsPath, req.params.filename);
  fs.unlink(filePath)
    .then(() => {
      res.send({ message: "File deleted successfully." });
    })
    .catch(err => {
      res.status(500).send({
        message: "Could not delete the file.",
        error: err
      });
    });
});

app.post('/api/analyze-document', async (req, res) => {
  try {
    const { fileName } = req.body;
    const filePath = path.join(documentsPath, fileName);

    const pythonProcess = spawn('python3', ['analyze_utils.py', fileName, filePath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ error: 'Error analyzing document', details: errorOutput });
      }

      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (error) {
        console.error('Error parsing Python script output:', error);
        console.error('Raw output:', output);
        res.status(500).json({ error: 'Error parsing analysis result', details: output });
      }
    });
  } catch (error) {
    console.error('Error in /api/analyze-document:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.post('/api/process-document', async (req, res) => {
  try {
    const { fileName, placeholders } = req.body;
    const filePath = path.join(documentsPath, fileName);
    const placeholdersPath = path.join(projectRoot, 'Placeholders', `${fileName}.json`);

    // Save placeholders to a JSON file
    await fs.writeFile(placeholdersPath, JSON.stringify(placeholders, null, 2));

    const pythonProcess = spawn('python3', ['process_utils.py', fileName, filePath, placeholdersPath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        return res.status(500).json({ error: 'Error processing document', details: errorOutput });
      }

      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (error) {
        console.error('Error parsing Python script output:', error);
        console.error('Raw output:', output);
        res.status(500).json({ error: 'Error parsing processing result', details: output });
      }
    });
  } catch (error) {
    console.error('Error in /api/process-document:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
// Offline support endpoints
app.post('/api/sync', async (req, res) => {
  try {
    const { files, placeholders } = req.body;
    const syncId = uuidv4();
    const syncDir = path.join(projectRoot, 'sync', syncId);
    await fs.mkdir(syncDir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(syncDir, file.name);
      await fs.writeFile(filePath, Buffer.from(file.content, 'base64'));
    }

    for (const [fileName, placeholderData] of Object.entries(placeholders)) {
      const placeholderPath = path.join(syncDir, `${fileName}.json`);
      await fs.writeFile(placeholderPath, JSON.stringify(placeholderData));
    }

    res.json({ syncId });
  } catch (error) {
    console.error('Error during sync:', error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

app.get('/api/sync/:syncId', async (req, res) => {
  try {
    const { syncId } = req.params;
    const syncDir = path.join(projectRoot, 'sync', syncId);
    const files = await fs.readdir(syncDir);

    const syncData = {
      files: [],
      placeholders: {},
    };

    for (const file of files) {
      const filePath = path.join(syncDir, file);
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        if (file.endsWith('.json')) {
          const placeholderData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
          syncData.placeholders[file.replace('.json', '')] = placeholderData;
        } else {
          const content = await fs.readFile(filePath, 'base64');
          syncData.files.push({ name: file, content });
        }
      }
    }

    res.json(syncData);
  } catch (error) {
    console.error('Error retrieving sync data:', error);
    res.status(500).json({ error: 'Failed to retrieve sync data' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(projectRoot, 'build', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Documents path: ${documentsPath}`);
  console.log(`Placeholders path: ${placeholdersPath}`);
  console.log(`Processed Documents path: ${processedDocumentsPath}`);
});
