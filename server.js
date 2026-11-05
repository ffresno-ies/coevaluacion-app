const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

let appState = {
  votingActive: false,
  activeGroupIndex: null,
  groups: [],
  rubricCriteria: []
};

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

app.get('/profesor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profesor.html'));
});

app.get('/alumno', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'alumno.html'));
});

app.get('/', (req, res) => {
  res.redirect('/alumno');
});

io.on('connection', (socket) => {
  socket.emit('stateUpdate', appState);

  socket.on('updateRubric', (criteriaArray) => {
    if (Array.isArray(criteriaArray) && criteriaArray.length > 0) {
      appState.rubricCriteria = criteriaArray.map(c => c.trim()).filter(c => c.length > 0);
      io.emit('stateUpdate', appState);
    }
  });

  socket.on('clearRubric', () => {
    appState.rubricCriteria = [];
    io.emit('stateUpdate', appState);
  });

  socket.on('addGroup', (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    appState.groups.push({
      name: groupName.trim(),
      votes: [],
      avgScore: "0.0",
      criteriaAvgs: []
    });
    io.emit('stateUpdate', appState);
  });

  socket.on('removeGroup', (index) => {
    if (index >= 0 && index < appState.groups.length) {
      appState.groups.splice(index, 1);
      if (appState.activeGroupIndex === index) {
        appState.activeGroupIndex = null;
        appState.votingActive = false;
      } else if (appState.activeGroupIndex > index) {
        appState.activeGroupIndex--;
      }
      io.emit('stateUpdate', appState);
    }
  });

  socket.on('setActiveGroup', (index) => {
    if (index >= 0 && index < appState.groups.length) {
      appState.activeGroupIndex = index;
      appState.votingActive = true;
      io.emit('stateUpdate', appState);
    }
  });

  socket.on('toggleVoting', () => {
    appState.votingActive = !appState.votingActive;
    io.emit('stateUpdate', appState);
  });

  socket.on('resetSession', () => {
    appState = {
      votingActive: false,
      activeGroupIndex: null,
      groups: [],
      rubricCriteria: []
    };
    io.emit('stateUpdate', appState);
  });

  socket.on('submitVote', ({ score, scores, voterId }) => {
    if (!appState.votingActive || appState.activeGroupIndex === null) return;
    const group = appState.groups[appState.activeGroupIndex];
    if (!group) return;

    let overallScore = 0;
    let scoresList = [];

    if (appState.rubricCriteria.length > 0 && Array.isArray(scores)) {
      if (scores.length !== appState.rubricCriteria.length) return;
      scoresList = scores.map(Number);
      const sum = scoresList.reduce((a, b) => a + b, 0);
      overallScore = sum / scoresList.length;
    } else if (score !== undefined) {
      const numScore = Number(score);
      if (isNaN(numScore) || numScore < 1 || numScore > 10) return;
      overallScore = numScore;
    } else {
      return;
    }

    const voteRecord = { voterId, scores: scoresList, overallScore };
    const existingIndex = group.votes.findIndex(v => v.voterId === voterId);

    if (existingIndex !== -1) {
      group.votes[existingIndex] = voteRecord;
    } else {
      group.votes.push(voteRecord);
    }

    const totalGlobalAvg = group.votes.reduce((acc, curr) => acc + curr.overallScore, 0);
    group.avgScore = (totalGlobalAvg / group.votes.length).toFixed(1);

    if (appState.rubricCriteria.length > 0) {
      const numCriteria = appState.rubricCriteria.length;
      const criteriaSums = new Array(numCriteria).fill(0);
      group.votes.forEach(v => {
        if (v.scores && v.scores.length === numCriteria) {
          v.scores.forEach((sc, idx) => {
            criteriaSums[idx] += sc;
          });
        }
      });
      group.criteriaAvgs = criteriaSums.map(sum => (sum / group.votes.length).toFixed(1));
    }

    io.emit('stateUpdate', appState);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n==================================================');
  console.log('🚀 SERVIDOR DE COEVALUACIÓN EN EJECUCIÓN');
  console.log('==================================================');
  console.log(`👨‍🏫 Acceso Profesor: http://${localIP}:${PORT}/profesor`);
  console.log(`👨‍🎓 Acceso Alumnos:  http://${localIP}:${PORT}/alumno`);
  console.log('==================================================\n');
});
