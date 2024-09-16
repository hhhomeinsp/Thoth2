import React from 'react';

export const Alert = ({ children, variant = 'default' }) => (
  <div className={`alert alert-${variant}`} role="alert">
    {children}
  </div>
);

export const AlertTitle = ({ children }) => (
  <h4 className="alert-title">{children}</h4>
);

export const AlertDescription = ({ children }) => (
  <div className="alert-description">{children}</div>
);
