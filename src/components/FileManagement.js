import React, { useState, useEffect } from 'react';
import FileViewer from './FileViewer';

const FileManagement = ({ onFileSelect }) => {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:5010/api/files');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:5010/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('File uploaded successfully!');
        fetchFiles(); // Refresh the file list after successful upload
      } else {
        alert('File upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('An error occurred while uploading the file.');
    }
  };

  const handleDeleteFile = async (filename) => {
    try {
      const response = await fetch(`http://localhost:5010/api/files/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('File deleted successfully.');
        fetchFiles(); // Refresh the file list after deletion
      } else {
        alert('Failed to delete the file. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('An error occurred while deleting the file.');
    }
  };

  return (
    <div className="file-management">
      <h3>File Management</h3>
      <input
        type="file"
        onChange={(e) => handleFileUpload(e.target.files[0])}
        style={{ display: 'none' }}
        id="file-upload"
      />
      <label htmlFor="file-upload" className="upload-button">
        Upload File
      </label>
      <FileViewer
        files={files}
        onFileSelect={onFileSelect}
        onDeleteFile={handleDeleteFile}
        onFilesUpdate={fetchFiles}
      />
    </div>
  );
};

export default FileManagement;
