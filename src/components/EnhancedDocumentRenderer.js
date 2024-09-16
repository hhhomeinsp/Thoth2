import React, { useRef, useEffect } from 'react';

const EnhancedDocumentRenderer = ({ fileContent, scale }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = fileContent;
    }
  }, [fileContent]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: '100%',
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
      }}
      className="html-document"
    />
  );
};

export default EnhancedDocumentRenderer;