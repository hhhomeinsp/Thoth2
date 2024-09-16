import React from 'react';
import { File, Trash } from 'lucide-react';

const FileViewer = ({ files, onFileSelect, onDeleteFile }) => {
  const handleDelete = async (event, file) => {
    event.stopPropagation();
    await onDeleteFile(file.name);
  };

  const supportedFiles = files.filter(file => 
    file.name.toLowerCase().endsWith('.pdf') ||
    file.name.toLowerCase().endsWith('.docx') ||
    file.name.toLowerCase().endsWith('.doc') ||
    file.name.toLowerCase().endsWith('.txt')
  );

  return (
    <div className="file-viewer">
      <h3 style={{ fontWeight: 'bold' }}>Uploaded Files</h3>
      {supportedFiles.length === 0 ? (
        <p>No supported files uploaded yet.</p>
      ) : (
        <ul className="file-list">
          {supportedFiles.map((file) => (
            <li key={file.id} onClick={() => onFileSelect(file)}>
              <File size={16} />
              <span>{file.name}</span>
              <button onClick={(e) => handleDelete(e, file)} className="delete-button">
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileViewer;