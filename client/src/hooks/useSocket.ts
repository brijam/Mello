import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function useSocket() {
  const socketRef = useRef(getSocket());
  const [isConnected, setIsConnected] = useState(socketRef.current.connected);

  useEffect(() => {
    const s = socketRef.current;

    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    if (!s.connected) {
      s.connect();
    }

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, isConnected };
}
