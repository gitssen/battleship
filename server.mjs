import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer);
  const rooms = new Map();
  let waitingPlayer = null;

  const startTurnTimer = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.timer) clearInterval(room.timer);
    room.timeLeft = 30;

    console.log(`Starting timer for room ${roomId}, turn: ${room.turn}`);

    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(roomId).emit("timerUpdate", { timeLeft: room.timeLeft });

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        const nextTurnId = room.players.find(p => p.id !== room.turn).id;
        room.turn = nextTurnId;
        console.log(`Timeout in ${roomId}. Next turn: ${nextTurnId}`);
        io.to(roomId).emit("turnTimeout", { nextTurn: room.turn });
        startTurnTimer(roomId);
      }
    }, 1000);
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("findMatch", (username) => {
      if (waitingPlayer) {
        const roomId = `room-${waitingPlayer.id}-${socket.id}`;
        socket.join(roomId);
        waitingPlayer.join(roomId);

        const players = [
          { id: waitingPlayer.id, username: waitingPlayer.username },
          { id: socket.id, username: username }
        ];

        rooms.set(roomId, {
          players: players,
          ready: {},
          ships: {},
          turn: waitingPlayer.id,
          hits: { [waitingPlayer.id]: 0, [socket.id]: 0 },
          timer: null,
          timeLeft: 30
        });

        io.to(roomId).emit("matchFound", { roomId, players });
        waitingPlayer = null;
      } else {
        socket.username = username;
        waitingPlayer = socket;
        socket.emit("waitingForMatch");
      }
    });

    socket.on("playerReady", ({ roomId, ships }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      room.ready[socket.id] = true;
      room.ships[socket.id] = ships.map(s => ({ ...s, hits: 0 }));

      socket.to(roomId).emit("opponentReady");

      if (Object.keys(room.ready).length === 2) {
        io.to(roomId).emit("startGame", { firstTurn: room.turn });
        startTurnTimer(roomId);
      }
    });

    socket.on("attack", ({ roomId, row, col }) => {
      const room = rooms.get(roomId);
      if (!room || room.turn !== socket.id) return;

      const opponentId = room.players.find(p => p.id !== socket.id).id;
      const opponentShips = room.ships[opponentId];
      
      let isHit = false;
      let sunkShipName = null;

      for (const ship of opponentShips) {
        for (const cell of ship.cells) {
          if (cell[0] === row && cell[1] === col) {
            isHit = true;
            ship.hits++;
            room.hits[socket.id]++;
            if (ship.hits === ship.cells.length) sunkShipName = ship.name;
            if (room.hits[socket.id] === 17) {
              io.to(roomId).emit("gameOver", { winner: socket.id });
              clearInterval(room.timer);
            }
            break;
          }
        }
        if (isHit) break;
      }

      room.turn = opponentId;
      startTurnTimer(roomId);

      io.to(roomId).emit("attackResult", {
        attacker: socket.id,
        row,
        col,
        isHit,
        sunkShipName,
        nextTurn: room.turn
      });
    });

    socket.on("disconnect", () => {
      for (const [roomId, room] of rooms.entries()) {
        if (room.players.some(p => p.id === socket.id)) {
          clearInterval(room.timer);
          rooms.delete(roomId);
          io.to(roomId).emit("opponentDisconnected");
          break;
        }
      }
      if (waitingPlayer === socket) waitingPlayer = null;
      console.log("User disconnected:", socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
