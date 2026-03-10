'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import Game from '@/components/Game';
import styles from './page.module.css';

interface Player {
  id: string;
  username: string;
}

export default function Lobby() {
  const socket = useSocket();
  const [username, setUsername] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [matchData, setMatchData] = useState<{ roomId: string; players: Player[] } | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('matchFound', (data) => {
      setMatchData(data);
      setIsSearching(false);
    });

    return () => {
      socket.off('matchFound');
    };
  }, [socket]);

  const handleFindMatch = () => {
    if (!username.trim()) return;
    setIsSearching(true);
    socket?.emit('findMatch', username);
  };

  if (matchData && socket) {
    const player = matchData.players.find(p => p.id === socket.id)!;
    const opponent = matchData.players.find(p => p.id !== socket.id)!;

    return (
      <Game 
        socket={socket} 
        roomId={matchData.roomId} 
        player={player} 
        opponent={opponent} 
      />
    );
  }

  return (
    <div className={styles.container}>
      <h1>Battleship Multiplayer</h1>
      {!isSearching ? (
        <div className={styles.lobbyForm}>
          <input
            type="text"
            placeholder="Enter your nickname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={styles.input}
          />
          <button onClick={handleFindMatch} className={styles.button}>
            Find a Match
          </button>
        </div>
      ) : (
        <div className={styles.searching}>
          <p>Searching for an opponent...</p>
          <div className={styles.loader}></div>
        </div>
      )}
    </div>
  );
}
