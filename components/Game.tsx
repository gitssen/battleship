'use client';

import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import styles from './Game.module.css';

interface Ship {
  name: string;
  size: number;
}

const SHIPS: Ship[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Destroyer', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Patrol Boat', size: 2 },
];

interface Props {
  socket: Socket;
  roomId: string;
  player: { id: string; username: string };
  opponent: { id: string; username: string };
}

const SHIP_ICONS: Record<string, string> = {
  'Carrier': 'https://api.iconify.design/mdi:ferry.svg?color=white',
  'Battleship': 'https://api.iconify.design/mdi:ship.svg?color=white',
  'Destroyer': 'https://api.iconify.design/mdi:anchor.svg?color=white',
  'Submarine': 'https://api.iconify.design/mdi:submarine.svg?color=white',
  'Patrol Boat': 'https://api.iconify.design/mdi:sail-boat.svg?color=white',
};

export default function Game({ socket, roomId, player, opponent }: Props) {
  const [board, setBoard] = useState<(string | null)[][]>(Array(10).fill(null).map(() => Array(10).fill(null)));
  const [opponentBoard, setOpponentBoard] = useState<(string | null)[][]>(Array(10).fill(null).map(() => Array(10).fill(null)));
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [isVertical, setIsVertical] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [turn, setTurn] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [sunkMessage, setSunkMessage] = useState<string | null>(null);
  const [hoveredCells, setHoveredCells] = useState<{ cells: [number, number][]; isValid: boolean } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ r: number; c: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (!socket) return;

    socket.on('startGame', ({ firstTurn }) => {
      setGameStarted(true);
      setTurn(firstTurn);
    });

    socket.on('timerUpdate', ({ timeLeft }) => {
      setTimeLeft(timeLeft);
    });

    socket.on('turnTimeout', ({ nextTurn }) => {
      setTurn(nextTurn);
      setLogs(prev => [`Turn skipped due to timeout`, ...prev].slice(0, 10));
      setTimeLeft(30);
    });

    socket.on('attackResult', ({ attacker, row, col, isHit, sunkShipName, nextTurn }) => {
      const attackerName = attacker === socket.id ? 'You' : opponent.username;
      const resultLabel = isHit ? 'HIT' : 'MISS';
      const newLog = `${attackerName} attacked [${String.fromCharCode(65 + col)}${row + 1}] - ${resultLabel}`;
      
      setLogs(prev => [newLog, ...prev].slice(0, 10));
      setLastMove({ r: row, c: col });

      if (attacker === socket.id) {
        setOpponentBoard(prev => {
          const newBoard = prev.map(r => [...r]);
          newBoard[row][col] = isHit ? 'hit' : 'miss';
          return newBoard;
        });
      } else {
        setBoard(prev => {
          const newBoard = prev.map(r => [...r]);
          newBoard[row][col] = isHit ? 'hit' : 'miss';
          return newBoard;
        });
      }

      if (sunkShipName) {
        const message = attacker === socket.id 
          ? `You sank the opponent's ${sunkShipName}!` 
          : `Your ${sunkShipName} has been sunk!`;
        setSunkMessage(message);
        setTimeout(() => setSunkMessage(null), 3000);
      }

      setTurn(nextTurn);
    });

    socket.on('gameOver', ({ winner }) => {
      setWinner(winner);
    });

    socket.on('opponentDisconnected', () => {
      setLogs(prev => [`Opponent disconnected. Game ended.`, ...prev]);
      setTimeout(() => window.location.reload(), 5000);
    });

    return () => {
      socket.off('startGame');
      socket.off('timerUpdate');
      socket.off('turnTimeout');
      socket.off('attackResult');
      socket.off('gameOver');
      socket.off('opponentDisconnected');
    };
  }, [socket, opponent.username]);

  const handleCellClick = (r: number, c: number) => {
    if (isReady || currentShipIndex >= SHIPS.length) return;

    const currentShip = SHIPS[currentShipIndex];
    const cells: [number, number][] = [];
    for (let i = 0; i < currentShip.size; i++) {
      const row = isVertical ? r + i : r;
      const col = isVertical ? c : c + i;
      if (row >= 10 || col >= 10 || board[row][col] !== null) return;
      cells.push([row, col]);
    }

    const newBoard = [...board.map(row => [...row])];
    cells.forEach(([row, col]) => {
      newBoard[row][col] = currentShip.name;
    });

    setBoard(newBoard);
    setCurrentShipIndex(currentShipIndex + 1);
    setHoveredCells(null);
  };

  const handleMouseEnter = (r: number, c: number) => {
    if (isReady || currentShipIndex >= SHIPS.length) return;

    const currentShip = SHIPS[currentShipIndex];
    const cells: [number, number][] = [];
    let isValid = true;

    for (let i = 0; i < currentShip.size; i++) {
      const row = isVertical ? r + i : r;
      const col = isVertical ? c : c + i;
      if (row >= 10 || col >= 10 || board[row][col] !== null) {
        isValid = false;
      }
      cells.push([row, col]);
    }
    setHoveredCells({ cells, isValid });
  };

  const handleAttack = (r: number, c: number) => {
    if (!gameStarted || turn !== socket.id || winner || opponentBoard[r][c]) return;
    socket.emit('attack', { roomId, row: r, col: c });
  };

  const handleReady = () => {
    setIsReady(true);
    const shipsData = SHIPS.map(ship => {
      const cells: [number, number][] = [];
      board.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell === ship.name) cells.push([r, c]);
        });
      });
      return { name: ship.name, cells };
    });
    socket.emit('playerReady', { roomId, ships: shipsData });
  };

  const renderGridWithCoordinates = (
    gridData: (string | null)[][],
    isOpponent: boolean,
    onCellClick: (r: number, c: number) => void,
    onMouseEnter?: (r: number, c: number) => void,
    onMouseLeave?: () => void,
    locked?: boolean
  ) => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    return (
      <div className={`${styles.gridContainer} ${locked ? styles.lockedGrid : ''}`}>
        <div className={styles.grid}>
          {/* Top-left empty corner */}
          <div className={styles.coordCell}></div>
          
          {/* Column letters */}
          {letters.map(letter => (
            <div key={letter} className={styles.coordCell}>{letter}</div>
          ))}

          {gridData.map((row, r) => (
            <div style={{ display: 'contents' }} key={`row-${r}`}>
              {/* Row number */}
              <div className={styles.coordCell}>{r + 1}</div>
              
              {/* Actual grid cells */}
              {row.map((cell, c) => {
                const isHovered = hoveredCells?.cells.some(([hr, hc]) => hr === r && hc === c);
                const hoverClass = isHovered ? (hoveredCells?.isValid ? styles.hoverValid : styles.hoverInvalid) : '';
                const isLastMove = lastMove?.r === r && lastMove?.c === c && (!isOpponent ? turn === socket.id : turn !== socket.id);
                
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`${styles.cell} ${cell && cell !== 'hit' && cell !== 'miss' && !isOpponent ? styles.ship : ''} ${cell === 'hit' ? styles.hit : ''} ${cell === 'miss' ? styles.miss : ''} ${hoverClass} ${isLastMove ? styles.lastMove : ''}`}
                    onClick={() => onCellClick(r, c)}
                    onMouseEnter={() => onMouseEnter?.(r, c)}
                    onMouseLeave={() => onMouseLeave?.()}
                  >
                    {cell && cell !== 'hit' && cell !== 'miss' && !isOpponent && (
                      <img src={SHIP_ICONS[cell]} className={styles.shipIcon} alt={cell} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.gameContainer}>
      {sunkMessage && <div className={styles.sunkNotification}>{sunkMessage}</div>}
      {winner && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h1>{winner === socket.id ? 'VICTORY!' : 'DEFEAT!'}</h1>
            <p>{winner === socket.id ? 'You sank the entire fleet!' : 'Your fleet was destroyed.'}</p>
            <button onClick={() => window.location.reload()} className={styles.buttonLarge}>Play Again</button>
          </div>
        </div>
      )}

      <div className={styles.mainGame}>
        <div className={styles.header}>
          <h1>{player.username} <span className={styles.vs}>VS</span> {opponent.username}</h1>
          
          {!gameStarted ? (
            <div className={styles.setupStatus}>
              {isReady ? (
                <div className={styles.waitingBadge}>Ready! Waiting for {opponent.username}...</div>
              ) : (
                <div className={styles.setupInstructions}>
                  {currentShipIndex < SHIPS.length ? (
                    <>
                      <p>Place your <strong>{SHIPS[currentShipIndex].name}</strong> ({SHIPS[currentShipIndex].size} units)</p>
                      <button onClick={() => setIsVertical(!isVertical)} className={styles.buttonSmall}>
                        Rotate: {isVertical ? 'Vertical' : 'Horizontal'}
                      </button>
                    </>
                  ) : (
                    <p>All ships placed! Confirm your fleet position.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.turnSection}>
              <div className={`${styles.turnIndicator} ${turn === socket.id ? styles.myTurn : styles.opponentTurn}`}>
                {turn === socket.id ? "YOUR TURN" : "OPPONENT'S TURN"}
              </div>
              <div className={`${styles.timer} ${timeLeft < 10 ? styles.timerWarning : ''}`}>
                {timeLeft}s
              </div>
            </div>
          )}
        </div>

        <div className={styles.gameLayout}>
          {gameStarted && (
            <div className={styles.logsSidebar}>
              <h3>Action Log</h3>
              <div className={styles.logList}>
                {logs.map((log, i) => (
                  <div key={i} className={styles.logItem}>{log}</div>
                ))}
                {logs.length === 0 && <p className={styles.emptyLog}>Waiting for action...</p>}
              </div>
            </div>
          )}

          <div className={styles.boardsContainer}>
            <div className={styles.boardWrapper}>
              <h3>Your Fleet</h3>
              {renderGridWithCoordinates(
                board,
                false,
                handleCellClick,
                handleMouseEnter,
                () => setHoveredCells(null),
                isReady && !gameStarted
              )}
              {!isReady && currentShipIndex === SHIPS.length && (
                <button onClick={handleReady} className={styles.buttonLarge}>Ready to Battle</button>
              )}
            </div>

            {gameStarted && (
              <div className={styles.boardWrapper}>
                <h3>Opponent's Grid</h3>
                <div className={`${turn !== socket.id ? styles.disabledGrid : ''}`}>
                  {renderGridWithCoordinates(
                    opponentBoard,
                    true,
                    handleAttack
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
