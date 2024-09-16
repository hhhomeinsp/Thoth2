import React from 'react';
import Dashboard from './components/Dashboard.js';
import './styles/global.css';

function App() {
  console.log('App component is rendering');
  return (
    <div className="App">
      <header className="App-header">
        <h1 style={{ 
          color: '#4a4a4a', 
          fontFamily: 'Arial, sans-serif',
          fontSize: '1.8rem',
          fontWeight: 'bold',
          textAlign: 'left',
          padding: '15px 0 15px 220px', // Assuming a 200px wide sidebar
          borderBottom: '2px solid #e0e0e0'
        }}>
          DocuGen
        </h1>
      </header>
      <Dashboard />
    </div>
  );
}

export default App;
