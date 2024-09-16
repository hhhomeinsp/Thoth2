import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, Search, AlertCircle } from 'lucide-react';
import DocumentViewer from './DocumentViewer.js';
import FileViewer from './FileViewer.js';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';
console.log('API_URL:', API_URL); // Add this line for debugging

const DocumentEngine = () => {
  const [dragActive, setDragActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log(`Fetching files from ${API_URL}/api/files...`);
      const response = await fetch(`${API_URL}/api/files`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'include',
      });
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Received files:', data);
      
      if (!Array.isArray(data)) {
        throw new Error('Received data is not an array');
      }
      
      setFiles(data);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError(`Failed to fetch files: ${error.message}. Please ensure the backend server is running on ${API_URL} and is accessible.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('DocumentEngine component mounted');
    fetchFiles();
  }, [fetchFiles]);

  const handleFileUpload = useCallback(async (file) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
  
    if (file && allowedTypes.includes(file.type)) {
      const formData = new FormData();
      formData.append('file', file);
      setUploadStatus('uploading');
      try {
        const response = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log('File uploaded and converted successfully:', result);
        setUploadStatus('success');
        fetchFiles(); // Fetch files after successful upload
      } catch (error) {
        console.error('Error uploading and converting file:', error);
        setUploadStatus('error');
        setError(`Failed to upload and convert file: ${error.message}`);
      }
    } else {
      setError('Please select a PDF, DOC, DOCX, or TXT file.');
    }
  }, [fetchFiles]);
  
  const handleDeleteFile = async (filename) => {
    try {
      const response = await fetch(`${API_URL}/api/files/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (selectedFile && selectedFile.name === filename) {
          setSelectedFile(null);
        }
        setUploadStatus('deleted');
        fetchFiles(); // Refresh the file list after deletion
      } else {
        const errorData = await response.json();
        if (response.status === 404) {
          setError('File not found. It may have been already deleted.');
        } else {
          setError(`Failed to delete the file: ${errorData.message}`);
        }
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      setError(`An error occurred while deleting the file: ${error.message}`);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (file) => {
    const selectedFileWithUrl = {
      ...file,
      url: `${API_URL}${file.path}`
    };
    setSelectedFile(selectedFileWithUrl);
  };

  return (
    <div className="document-engine">
      <h2>Document Engine</h2>
      {error && (
        <div className="error-message bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <AlertCircle className="inline-block mr-2" />
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {uploadStatus === 'success' && (
        <div className="success-message bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">File uploaded successfully!</span>
        </div>
      )}
      {uploadStatus === 'deleted' && (
        <div className="success-message bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">File deleted successfully!</span>
        </div>
      )}
      <div 
        className={`file-uploader ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
      <input
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        onChange={(e) => handleFileUpload(e.target.files[0])}
        style={{ display: 'none' }}
        id="file-input"
      />

        <label htmlFor="file-input" className="upload-area">
          <Upload size={24} />
          <span>Drag & Drop files here or click to upload</span>
        </label>
      </div>
      <div className="file-manager">
        <div className="search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {isLoading ? (
          <div>Loading files...</div>
        ) : (
          <FileViewer 
            files={files.filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase()))}
            onFileSelect={handleFileSelection} 
            onDeleteFile={handleDeleteFile} 
            onFilesUpdate={fetchFiles}
          />
        )}
      </div>
      {selectedFile && (
        <div className="document-viewer-window">
          <div className="document-viewer-header">
            <h3>Document Viewer</h3>
            <button className="close-button" onClick={() => setSelectedFile(null)}>
              <X size={16} />
            </button>
          </div>
          <DocumentViewer selectedFile={selectedFile} onFileSelect={setSelectedFile} />
        </div>
      )}
    </div>
  );
};

export default DocumentEngine;
