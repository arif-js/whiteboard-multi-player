import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import throttle from 'lodash.throttle';
import { MousePointer2, Hand, Square, Circle, Trash2 } from 'lucide-react';

export default function WhiteboardApp() {
  const [elements, setElements] = useState<Y.Map<any>[]>([]);
  const [awarenessUsers, setAwarenessUsers] = useState<Map<number, any>>(new Map());
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'rect' | 'circle'>('select');
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [followingId, setFollowingId] = useState<number | null>(null);
  const panStartPos = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // 1. Initialize Yjs Doc and Provider
  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const p = new HocuspocusProvider({
      url: 'ws://localhost:1234',
      name: 'staff-room-01',
      document: doc,
    });
    return { ydoc: doc, provider: p };
  }, []);

  const sharedElements = ydoc.getArray<Y.Map<any>>('elements');

  useEffect(() => {
    const observeElements = () => {
      setElements(sharedElements.toArray());
    };
    sharedElements.observe(observeElements);
    sharedElements.observeDeep(observeElements);
    observeElements();
    
    // 3. Awareness Protocol
    const { awareness } = provider;
    
    // Generate Random user info with HSL for better colors
    const randomColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
    const randomId = Math.floor(Math.random() * 100);
    const randomName = `User ${randomId}`;
    const initials = `U${randomId}`;
    
    const observeAwareness = () => {
      if (awareness) setAwarenessUsers(new Map(awareness.getStates()));
    };

    if (awareness) {
      awareness.setLocalStateField('user', { name: randomName, color: randomColor, initials });
      awareness.on('change', observeAwareness);
      observeAwareness();
    }
    
    return () => {
      sharedElements.unobserve(observeElements);
      sharedElements.unobserveDeep(observeElements);
      if (awareness) {
        awareness.off('change', observeAwareness);
      }
    };
  }, [sharedElements, provider]);

  const addElement = (e: React.MouseEvent, type: 'rect' | 'circle') => {
    const el = new Y.Map<any>();
    el.set('id', crypto.randomUUID());
    el.set('type', type);
    // Add relative to the center of the current camera view
    el.set('x', window.innerWidth / 2 - 50 - camera.x + (Math.random() * 40 - 20));
    el.set('y', window.innerHeight / 2 - 50 - camera.y + (Math.random() * 40 - 20));
    el.set('color', `hsl(${Math.floor(Math.random() * 360)}, 80%, 75%)`);
    
    ydoc.transact(() => {
      sharedElements.push([el]);
    });
    // Immediately switch back to select tool so they can drag it!
    setActiveTool('select');
  };

  const clearBoard = () => {
    if (window.confirm('Are you sure you want to clear the entire board?')) {
      sharedElements.delete(0, sharedElements.length);
    }
  };
  
  // Dragging logic
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0, elX: 0, elY: 0 });

  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if (followingId !== null) setFollowingId(null);
    // Pan if hand tool is active...
    if (activeTool === 'pan' || e.button === 1 || (e.target as Element).tagName.toLowerCase() === 'svg') {
      setIsPanning(true);
      panStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        camX: camera.x,
        camY: camera.y,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, el: Y.Map<any>) => {
    if (followingId !== null) setFollowingId(null);
    if (activeTool === 'pan' || e.button === 1) return;
    if (activeTool !== 'select') return;
    
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(el.get('id'));
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elX: el.get('x'),
      elY: el.get('y'),
    };
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    throttledCursorUpdate(e.clientX - camera.x, e.clientY - camera.y);

    if (isPanning) {
      setCamera({
        x: panStartPos.current.camX + (e.clientX - panStartPos.current.x),
        y: panStartPos.current.camY + (e.clientY - panStartPos.current.y),
      });
    } else if (draggingId) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      
      const el = elements.find(map => map.get('id') === draggingId);
      if (el) {
        ydoc.transact(() => {
          el.set('x', dragStartPos.current.elX + dx);
          el.set('y', dragStartPos.current.elY + dy);
        });
      }
    }
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setIsPanning(false);
  };

  const throttledCursorUpdate = useCallback(
    throttle((x: number, y: number) => {
      provider.awareness?.setLocalStateField('cursor', { x, y });
    }, 30),
    [provider.awareness]
  );
  
  const localClientId = ydoc.clientID;

  // Follow a user's cursor
  useEffect(() => {
    if (followingId === null) return;
    const userState = awarenessUsers.get(followingId);
    if (userState && userState.cursor) {
      setCamera({
        x: window.innerWidth / 2 - userState.cursor.x,
        y: window.innerHeight / 2 - userState.cursor.y,
      });
    }
  }, [awarenessUsers, followingId]);

  // Active user logic
  const activeUserEntries = Array.from(awarenessUsers.entries()).filter(([_, s]) => s?.user);

  return (
    <div 
      className="whiteboard-container"
      style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      
      {/* Top Header */}
      <div className="header-bar">
        <div className="project-title">
          Co-Draw Engine ✨
        </div>
        
        <div className="users-cluster">
          <div style={{ 
            marginRight: '12px', 
            fontWeight: 600, 
            color: '#475569', 
            fontSize: '0.85rem', 
            backgroundColor: 'rgba(255, 255, 255, 0.7)', 
            padding: '6px 12px', 
            borderRadius: '20px', 
            border: '1px solid rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
          }}>
            <span style={{ 
              display: 'inline-block', 
              width: '8px', 
              height: '8px', 
              backgroundColor: '#22c55e', 
              borderRadius: '50%', 
              marginRight: '8px',
              boxShadow: '0 0 8px #22c55e'
            }}></span>
            {activeUserEntries.length} Online
          </div>
          {activeUserEntries.slice(0, 5).map(([clientId, state], idx) => (
             <div 
               key={clientId} 
               onClick={() => {
                 if (clientId !== localClientId) {
                   setFollowingId(followingId === clientId ? null : clientId);
                 }
               }}
               className="user-avatar"
               style={{ 
                 backgroundColor: state.user.color,
                 cursor: clientId === localClientId ? 'default' : 'pointer',
                 border: followingId === clientId ? '3px solid #3b82f6' : '3px solid #f8fafc',
                 boxShadow: followingId === clientId ? '0 0 0 2px white, 0 0 10px rgba(59, 130, 246, 0.5)' : '0 4px 6px -1px rgba(0,0,0,0.1)'
               }}
               title={clientId === localClientId ? state.user.name + ' (You)' : state.user.name + (followingId === clientId ? ' (Following)' : ' (Click to follow)')}
             >
               {state.user.initials}
             </div>
          ))}
          {activeUserEntries.length > 5 && (
            <div className="user-avatar" style={{ backgroundColor: '#94a3b8' }}>
              +{activeUserEntries.length - 5}
            </div>
          )}
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="toolbar">
        <button 
          className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
          title="Select & Move Tool"
        >
          <MousePointer2 size={24} />
        </button>
        <button 
          className={`tool-btn ${activeTool === 'pan' ? 'active' : ''}`}
          onClick={() => setActiveTool('pan')}
          title="Pan/Hand Tool"
        >
          <Hand size={24} />
        </button>
        <div style={{ width: '1px', background: 'rgba(0,0,0,0.1)', margin: '4px 0' }} />
        <button 
          className="tool-btn"
          onClick={(e) => addElement(e, 'rect')}
          title="Add Rectangle"
        >
          <Square size={24} />
        </button>
        <button 
          className="tool-btn"
          onClick={(e) => addElement(e, 'circle')}
          title="Add Circle"
        >
          <Circle size={24} />
        </button>
        <div style={{ width: '1px', background: 'rgba(0,0,0,0.1)', margin: '4px 0' }} />
        <button 
          className="tool-btn danger"
          onClick={clearBoard}
          title="Clear Board"
        >
          <Trash2 size={24} />
        </button>
      </div>

      <svg 
        width="100%" 
        height="100%"
        onPointerDown={handleSvgPointerDown}
        style={{ cursor: activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      >
        <g transform={`translate(${camera.x}, ${camera.y})`}>
          {elements.map((el) => {
          const id = el.get('id');
          const type = el.get('type');
          const x = el.get('x');
          const y = el.get('y');
          const color = el.get('color');
          
          const isDragging = draggingId === id;
          const shapeClass = `canvas-shape ${isDragging ? 'grabbing' : ''}`;
          
          if (type === 'rect') {
            return (
              <rect
                key={id}
                className={shapeClass}
                x={x}
                y={y}
                width={100}
                height={100}
                fill={color}
                rx={16} // Rounded edges
                stroke="transparent"
                strokeWidth={1}
                onPointerDown={(e) => handlePointerDown(e, el)}
              />
            );
          } else if (type === 'circle') {
            return (
              <circle
                key={id}
                className={shapeClass}
                cx={x + 50}
                cy={y + 50}
                r={50}
                fill={color}
                stroke="transparent"
                strokeWidth={1}
                onPointerDown={(e) => handlePointerDown(e, el)}
              />
            );
          }
          return null;
        })}
        </g>
      </svg>
      
      {/* Ghost Cursors */}
      {Array.from(awarenessUsers.entries()).map(([clientId, state]) => {
        if (clientId === localClientId) return null; 
        if (!state || !state.cursor || !state.user) return null;
        
        return (
          <div
            key={clientId}
            style={{
              position: 'absolute',
              left: state.cursor.x + camera.x,
              top: state.cursor.y + camera.y,
              pointerEvents: 'none',
              transition: 'transform 0.05s linear',
              transform: `translate(-50%, -50%)`,
              zIndex: 9999
            }}
          >
            <MousePointer2 
              size={24} 
              color={state.user.color} 
              fill={state.user.color}
              style={{ transform: 'rotate(-45deg)', transformOrigin: 'top left' }}
            />
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: '100%',
                background: state.user.color,
                color: 'white',
                padding: '4px 8px',
                borderRadius: '8px',
                borderTopLeftRadius: 0,
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                marginTop: '4px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              {state.user.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}