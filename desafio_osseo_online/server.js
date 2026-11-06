const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code;
  do {
    code = Array.from({length: 6}, () => LETTERS[crypto.randomInt(LETTERS.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function cleanName(value) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 24);
}
function publicPlayers(room) {
  return [...room.players.values()]
    .map(p => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
}
function roomState(room) {
  return {
    code: room.code,
    status: room.status,
    questionIndex: room.questionIndex,
    questionCount: room.questions.length,
    question: room.status === "question" ? {
      text: room.questions[room.questionIndex].text,
      options: room.questions[room.questionIndex].options,
      number: room.questionIndex + 1,
      total: room.questions.length,
      endsAt: room.endsAt
    } : null,
    players: publicPlayers(room),
    podium: room.podium || []
  };
}
function broadcast(room) {
  io.to(room.code).emit("room:update", roomState(room));
}
function endQuestion(room) {
  if (room.status !== "question") return;
  clearTimeout(room.timer);
  room.status = "between";
  room.endsAt = null;
  broadcast(room);
}
function finishRoom(room) {
  clearTimeout(room.timer);
  room.status = "finished";
  room.podium = publicPlayers(room).slice(0, 3);
  broadcast(room);
}
function removeRoomIfEmpty(room) {
  if (room.status === "finished" && room.hostId == null && room.players.size === 0) {
    rooms.delete(room.code);
  }
}

io.on("connection", socket => {
  socket.on("host:create", (payload, ack = () => {}) => {
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    if (questions.length < 1 || questions.length > 50) {
      return ack({ ok: false, error: "Cadastre entre 1 e 50 perguntas." });
    }
    const normalized = [];
    for (const q of questions) {
      const text = String(q?.text || "").trim().slice(0, 400);
      const options = Array.isArray(q?.options) ? q.options.map(x => String(x || "").trim().slice(0, 160)) : [];
      const correct = Number(q?.correct);
      if (!text || options.length !== 4 || options.some(x => !x) || !Number.isInteger(correct) || correct < 0 || correct > 3) {
        return ack({ ok: false, error: "Revise as perguntas: cada uma precisa de enunciado, 4 alternativas e resposta correta." });
      }
      normalized.push({ text, options, correct });
    }
    const code = makeCode();
    const room = {
      code, hostId: socket.id, questions: normalized, players: new Map(),
      status: "waiting", questionIndex: -1, endsAt: null, timer: null, podium: []
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.role = "host";
    socket.data.room = code;
    ack({ ok: true, code, state: roomState(room) });
    broadcast(room);
  });

  socket.on("player:join", (payload, ack = () => {}) => {
    const code = String(payload?.code || "").trim().toUpperCase();
    const name = cleanName(payload?.name);
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: "Sala não encontrada. Confira o código." });
    if (!name) return ack({ ok: false, error: "Digite seu nome." });
    if (room.status === "finished") return ack({ ok: false, error: "Essa partida já terminou." });
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return ack({ ok: false, error: "Esse nome já está sendo usado na sala." });
    }
    room.players.set(socket.id, { id: socket.id, name, score: 0, answered: false });
    socket.join(code);
    socket.data.role = "player";
    socket.data.room = code;
    socket.data.name = name;
    ack({ ok: true, state: roomState(room), name });
    broadcast(room);
  });

  socket.on("host:start", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return ack({ ok: false, error: "Ação não autorizada." });
    if (room.status !== "waiting" || room.players.size === 0) return ack({ ok: false, error: "Aguarde ao menos um aluno entrar." });
    room.questionIndex = 0;
    room.status = "question";
    room.players.forEach(p => p.answered = false);
    room.endsAt = Date.now() + 15000;
    room.timer = setTimeout(() => endQuestion(room), 15000);
    broadcast(room);
    ack({ ok: true });
  });

  socket.on("player:answer", (payload, ack = () => {}) => {
    const room = rooms.get(socket.data.room);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.status !== "question") return ack({ ok: false, error: "Não há pergunta aberta." });
    if (player.answered) return ack({ ok: false, error: "Você já respondeu esta pergunta." });
    const choice = Number(payload?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return ack({ ok: false, error: "Alternativa inválida." });
    player.answered = true;
    const elapsed = Math.max(0, Date.now() - (room.endsAt - 15000));
    const correct = choice === room.questions[room.questionIndex].correct;
    const points = correct ? Math.round(600 + 400 * Math.max(0, 1 - elapsed / 15000)) : 0;
    player.score += points;
    ack({ ok: true, correct, points, total: player.score });
    broadcast(room);
  });

  socket.on("host:next", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return ack({ ok: false, error: "Ação não autorizada." });
    if (room.status !== "between") return ack({ ok: false, error: "A pergunta ainda está em andamento." });
    if (room.questionIndex + 1 >= room.questions.length) {
      finishRoom(room);
      ack({ ok: true, finished: true });
      return;
    }
    room.questionIndex += 1;
    room.status = "question";
    room.players.forEach(p => p.answered = false);
    room.endsAt = Date.now() + 15000;
    room.timer = setTimeout(() => endQuestion(room), 15000);
    broadcast(room);
    ack({ ok: true });
  });

  socket.on("host:finish", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return ack({ ok: false, error: "Ação não autorizada." });
    finishRoom(room);
    ack({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    if (room.hostId === socket.id) {
      room.hostId = null;
      io.to(code).emit("room:host-left");
    } else if (room.players.has(socket.id)) {
      room.players.delete(socket.id);
    }
    broadcast(room);
    removeRoomIfEmpty(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Desafio Ósseo em http://localhost:${PORT}`));
