import React from 'react';
import useWhiteboard from '../hooks/useWhiteboard';

const Canvas: React.FC = () => {
  const { canvasRef } = useWhiteboard();

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: '2px solid #333', borderRadius: '8px' }}
      />
    </div>
  );
};

export default Canvas;
