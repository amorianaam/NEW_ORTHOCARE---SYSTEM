import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    const serverUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : `http://${window.location.hostname}:5000`;
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
    });
  }
  return socket;
};

export const joinRoom = (role) => {
  const s = getSocket();
  s.emit('join-role', role);
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
