import React, { useState } from 'react';
import { FileText, Users, Settings } from 'lucide-react';
import DocumentEngine from './DocumentEngine.js';

const Dashboard = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeTab, setActiveTab] = useState('docugen');

  const handleFileSelect = (file) => {
    setSelectedFile(file);
  };

  return (
    <div className="dashboard">
      <div className="sidebar">
        <nav>
          <ul>
            <li className={activeTab === 'docugen' ? 'active' : ''} onClick={() => setActiveTab('docugen')}>
              <FileText size={20} />
            </li>
            <li className={activeTab === 'team' ? 'active' : ''} onClick={() => setActiveTab('team')}>
              <Users size={20} />
            </li>
            <li className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
              <Settings size={20} />
            </li>
          </ul>
        </nav>
      </div>
      <div className="dashboard-content">
        <div className="main-content">
          <div className="content-area">
            {activeTab === 'docugen' && (
              <DocumentEngine
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
              />
            )}
            {activeTab === 'team' && <h2>Team Management</h2>}
            {activeTab === 'settings' && <h2>Settings</h2>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
