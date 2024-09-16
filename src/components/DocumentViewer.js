import React, { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';
import { FileSearch, Plus } from 'lucide-react';
import EnhancedDocumentRenderer from './EnhancedDocumentRenderer.js';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const DocumentViewer = ({ selectedFile, onFileSelect }) => {
  const [fileContent, setFileContent] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [placeholders, setPlaceholders] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('document');
  const [processedContent, setProcessedContent] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [newPlaceholder, setNewPlaceholder] = useState({
    placeholder: '',
    description: '',
    explanation: '',
    newValue: '',
  });
  const [scale, setScale] = useState(1);

  const fetchPlaceholders = useCallback(async (fileName) => {
    try {
      const response = await fetch(`${API_URL}/api/placeholders/${fileName}`);
      if (!response.ok) {
        throw new Error('Failed to fetch placeholders');
      }
      const data = await response.json();
      setPlaceholders(
        data.analysis.placeholders.reduce((acc, placeholder) => {
          acc[placeholder.placeholder] = {
            description: placeholder.description || '',
            explanation: placeholder.explanation || '',
            newValue: placeholder.newValue || '',
          };
          return acc;
        }, {})
      );
    } catch (error) {
      console.error('Error fetching placeholders:', error);
    }
  }, []);

  useEffect(() => {
    const fetchProcessedContent = async () => {
      if (activeTab === 'processed' && selectedFile) {
        setIsLoading(true);
        try {
          const processedResponse = await fetch(
            `${API_URL}/api/processed-document/${selectedFile.name}`
          );
          if (processedResponse.ok) {
            const processedData = await processedResponse.json();
            if (processedData.processedContent) {
              setProcessedContent(processedData.processedContent);
              console.log('Loaded processed content for:', selectedFile.name);
            } else {
              setProcessedContent(null);
              console.log('No processed content available for:', selectedFile.name);
            }
          } else {
            if (processedResponse.status === 404) {
              setProcessedContent(null);
              console.log('No processed content available for:', selectedFile.name);
            } else {
              const errorText = await processedResponse.text();
              throw new Error(
                `Failed to load processed document: ${processedResponse.status} ${processedResponse.statusText}. ${errorText}`
              );
            }
          }
        } catch (error) {
          console.error('Error fetching processed content:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchProcessedContent();
  }, [activeTab, selectedFile]);  

  const debouncedAutosavePlaceholders = useCallback(
    debounce((updatedPlaceholders) => {
      if (selectedFile) {
        fetch(`${API_URL}/api/save-placeholders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            placeholders: updatedPlaceholders,
          }),
        })
          .then((response) => response.json())
          .then((data) => console.log('Autosave successful:', data))
          .catch((error) => console.error('Autosave failed:', error));
      }
    }, 500),
    [selectedFile]
  );

  useEffect(() => {
    const loadFileAndPlaceholders = async () => {
      if (selectedFile) {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch(
            `${API_URL}/api/convert-document/${selectedFile.name}`
          );
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Failed to load file: ${response.status} ${response.statusText}. ${errorText}`
            );
          }
          const data = await response.json();
          if (!data.content || !data.fileType) {
            throw new Error('Invalid response format from server');
          }
          setFileContent(data.content);
          setFileType(data.fileType);
          console.log('Loaded document with fileType:', data.fileType);
          await fetchPlaceholders(selectedFile.name);
        } catch (err) {
          console.error('Error loading file:', err);
          setError(`Failed to load the document: ${err.message}`);
          setFileContent(null);
          setFileType(null);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadFileAndPlaceholders();
  }, [selectedFile, fetchPlaceholders]);

  const handlePlaceholderChange = (placeholder, field, value) => {
    setPlaceholders((prevPlaceholders) => {
      const updatedPlaceholders = {
        ...prevPlaceholders,
        [placeholder]: { ...prevPlaceholders[placeholder], [field]: value },
      };
      debouncedAutosavePlaceholders(updatedPlaceholders);
      return updatedPlaceholders;
    });
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError('');
    setAnalysisProgress(0);
    try {
      const analyzeResponse = await fetch(`${API_URL}/api/analyze-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: selectedFile.name }),
      });

      const responseData = await analyzeResponse.json();
      console.log('Server response:', responseData);

      if (!analyzeResponse.ok) {
        throw new Error(
          responseData.error ||
            responseData.details ||
            'Failed to analyze document'
        );
      }

      if (responseData.placeholders) {
        const formattedPlaceholders = responseData.placeholders.reduce(
          (acc, placeholder) => {
            acc[placeholder.placeholder] = {
              description: placeholder.description || '',
              explanation: placeholder.explanation || '',
              newValue: placeholder.newValue || '',
            };
            return acc;
          },
          {}
        );
        setPlaceholders(formattedPlaceholders);
        setActiveTab('placeholders');
        setAnalysisProgress(100);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error analyzing document:', error);
      setError(`Failed to analyze the document: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setError('');
    setProcessingProgress(0);
    try {
      const processedPlaceholders = Object.fromEntries(
        Object.entries(placeholders).map(([key, value]) => [
          key,
          value.newValue || key,
        ])
      );
      const response = await fetch(`${API_URL}/api/process-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          placeholders: processedPlaceholders,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Server responded with ${response.status}`
        );
      }
      const result = await response.json();
      setProcessedContent(result.processedContent);
      setActiveTab('processed');
  
      // Optionally, save the processed content to the server for future retrieval
      await fetch(`${API_URL}/api/save-processed-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          processedContent: result.processedContent,
        }),
      });
  
      setProcessingProgress(100);
    } catch (error) {
      setError(`Failed to process the document: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  

  const handleAddPlaceholder = async () => {
    if (newPlaceholder.placeholder && newPlaceholder.description) {
      try {
        const response = await fetch(`${API_URL}/api/add-placeholder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            placeholder: newPlaceholder,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to add placeholder: ${response.statusText}`);
        }

        const updatedPlaceholders = {
          ...placeholders,
          [newPlaceholder.placeholder]: {
            description: newPlaceholder.description,
            explanation: newPlaceholder.explanation,
            newValue: newPlaceholder.newValue,
          },
        };

        setPlaceholders(updatedPlaceholders);
        debouncedAutosavePlaceholders(updatedPlaceholders);

        setNewPlaceholder({
          placeholder: '',
          description: '',
          explanation: '',
          newValue: '',
        });
      } catch (error) {
        setError(`Failed to add placeholder: ${error.message}`);
      }
    }
  };

  // Zoom functionality
  const changeZoom = (delta) => {
    setScale((prevScale) => Math.min(Math.max(0.5, prevScale + delta), 3));
  };

  const handleWheel = useCallback(
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        changeZoom(delta);
      }
    },
    []
  );

  useEffect(() => {
    const container = document.querySelector('.document-content');
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  if (isLoading) {
    return <div className="document-viewer-message">Loading...</div>;
  }

  if (error) {
    return (
      <div className="document-viewer-message error">
        <h3>Error Loading Document</h3>
        <p>{error}</p>
        <p>Please try again or contact support if the problem persists.</p>
      </div>
    );
  }

  if (!selectedFile) {
    return <div className="document-viewer-message">No file selected</div>;
  }

  return (
    <div className="document-viewer">
      <header className="document-viewer-header">
        <h2>{selectedFile.name}</h2>
        <nav className="document-tabs">
          <button
            onClick={() => setActiveTab('document')}
            className={activeTab === 'document' ? 'active' : ''}
          >
            Document
          </button>
          <button
            onClick={() => setActiveTab('placeholders')}
            className={activeTab === 'placeholders' ? 'active' : ''}
          >
            Placeholders
          </button>
          <button
            onClick={() => setActiveTab('processed')}
            className={activeTab === 'processed' ? 'active' : ''}
          >
            Processed
          </button>
        </nav>
      </header>

      <main className="document-viewer-content">
        {activeTab === 'document' && (
          <div className="document-content">
            {fileContent ? (
              <>
                <div className="document-controls">
                  <button onClick={() => changeZoom(-0.1)}>Zoom Out</button>
                  <span style={{ margin: '0 10px' }}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button onClick={() => changeZoom(0.1)}>Zoom In</button>
                </div>
                <div
                  className="document-wrapper"
                  style={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top center',
                    width: '100%',
                  }}
                >
                  <EnhancedDocumentRenderer
                    fileContent={fileContent}
                    fileType={
                      fileType || (selectedFile && selectedFile.type) || 'text/plain'
                    }
                    scale={scale}
                  />
                </div>
                <div className="analyze-button-wrapper">
                  <button
                    className="analyze-button"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="spinner"></div>
                        Analyzing... {analysisProgress.toFixed(0)}%
                      </>
                    ) : (
                      <>
                        <FileSearch size={20} />
                        Analyze
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div>Loading document content...</div>
            )}
          </div>
        )}

        {activeTab === 'placeholders' && (
          <div className="placeholders-content">
            <div className="placeholders-table-container">
              <table className="placeholders-table">
                <thead>
                  <tr>
                    <th>Placeholder</th>
                    <th>Current Text</th>
                    <th>Explanation</th>
                    <th>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(placeholders).map(([placeholder, data]) => (
                    <tr key={placeholder}>
                      <td>{placeholder}</td>
                      <td>{data.description}</td>
                      <td>{data.explanation}</td>
                      <td>
                        <input
                          type="text"
                          value={data.newValue}
                          onChange={(e) =>
                            handlePlaceholderChange(
                              placeholder,
                              'newValue',
                              e.target.value
                            )
                          }
                          placeholder="Enter new value"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <input
                        type="text"
                        value={newPlaceholder.placeholder}
                        onChange={(e) =>
                          setNewPlaceholder({
                            ...newPlaceholder,
                            placeholder: e.target.value,
                          })
                        }
                        placeholder="New placeholder"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={newPlaceholder.description}
                        onChange={(e) =>
                          setNewPlaceholder({
                            ...newPlaceholder,
                            description: e.target.value,
                          })
                        }
                        placeholder="Current text"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={newPlaceholder.explanation}
                        onChange={(e) =>
                          setNewPlaceholder({
                            ...newPlaceholder,
                            explanation: e.target.value,
                          })
                        }
                        placeholder="Explanation"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={newPlaceholder.newValue}
                        onChange={(e) =>
                          setNewPlaceholder({
                            ...newPlaceholder,
                            newValue: e.target.value,
                          })
                        }
                        placeholder="New value"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="process-button-container">
              <button
                className="analyze-button add-placeholder-button"
                onClick={handleAddPlaceholder}
                disabled={
                  !newPlaceholder.placeholder || !newPlaceholder.description
                }
              >
                <Plus size={20} />
                Add Placeholder
              </button>
              <button
                className="analyze-button process-button"
                onClick={handleProcess}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="spinner"></div>
                    Processing... {processingProgress}%
                  </>
                ) : (
                  <>
                    <FileSearch size={20} />
                    Process
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'processed' && (
          <div className="processed-content">
            {processedContent ? (
              <>
                <div className="document-controls">
                  <button onClick={() => changeZoom(-0.1)}>Zoom Out</button>
                  <span style={{ margin: '0 10px' }}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button onClick={() => changeZoom(0.1)}>Zoom In</button>
                </div>
                <div
                  className="document-wrapper"
                  style={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top center',
                    width: '100%',
                  }}
                >
                  <EnhancedDocumentRenderer
                    fileContent={processedContent}
                    fileType="text/html"
                    scale={scale}
                  />
                </div>
              </>
            ) : (
              <p>
                No processed document available. Click "Process" in the
                Placeholders tab to generate a processed document.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default DocumentViewer;
