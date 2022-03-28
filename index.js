const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
var room = "no1"
var currentQuestionIndex = -1
var timeoutID = setTimeout(timeOut, 1)
var userGroup = []
var joinRoom = []
var finishID = []
var isReady = []

/**
 * 路由
 */
app.get('/', (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.end("hello worlds");
});

app.get('/a', (req, res) => {
  res.sendFile(__dirname + '/clientA.html');
});

app.get('/b', (req, res) => {
  res.sendFile(__dirname + '/clientB.html');
});

/**
 * socket 事件
 */
io.on('connection', (socket) => {
  console.log('new user connected ' + 'socketID: ' + socket.id);
  /**
   * Room
   */
  socket.on('join', (data) => {
    var obj = JSON.parse(data)
    console.log("join => userID: " + obj.userID)
    userGroup.push(obj.userID)
    socket.join(room)

    if (userGroup.find( it => it == "2AB0BCAC0AF7B35AD957540E491256498F31FC20") && userGroup.find( it => it == "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE")) {
      var res = {roomID: "no1", userA: "2AB0BCAC0AF7B35AD957540E491256498F31FC20", userB: "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", videoID: "https://www.youtube.com/watch?v=cCOMPI8doc0"}
      io.emit('matched', res)
    }
  })

  socket.on('room_isReady', (data) => {
    var obj = JSON.parse(data)
    console.log("room_isReady => userID: " + obj.userID)
    if (!isReady.find ( it => it == obj.userID)) isReady.push(obj.userID)
    if (isReady.length == 2) {
      isReady.length = 0
      currentQuestionIndex = -1
      gameStart()
    }
  })

  socket.on('room_finish', (data) => {
    var obj = JSON.parse(data)
    console.log("room_finish => userID: " + obj.userID)
    finishID.push({userID: obj.userID, useTime: obj.useTime})
    if (finishID.length == 2) judge()
  })


  socket.on('leave', (data) => {
    var obj = JSON.parse(data)
    console.log("leave => userID: " + obj.userID)
    socket.leave(room)
    socket.disconnect()
    var index = userGroup.indexOf(obj.userID)
    if (index != -1) userGroup.splice(index, 1)
  })
 
  /**
   * 全體廣播
   */
  socket.on('connectCheck', (data) => {
    var obj = JSON.parse(data)
    console.log(obj.userID)
    userGroup.push(obj.userID)

    if (userGroup.find( it => it == "2AB0BCAC0AF7B35AD957540E491256498F31FC20") && userGroup.find( it => it == "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE")) {
      var res = {roomID: "no1", userA: "2AB0BCAC0AF7B35AD957540E491256498F31FC20", userB: "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", videoID: "621f35aaab711e06e4268512"}
      io.emit('matched', res)
    }
  })

});


/**
 * 連線 port 設定
 */
server.listen(8082, () => {
  console.log('listening on *:8082');
});

/**
 * game function
 */

function gameStart() {
  currentQuestionIndex ++
  io.in(room).emit('room_game_start', {index: currentQuestionIndex})
  clearTimeout(timeoutID)
  timeoutID = setTimeout(timeOut, 60000)
  console.log("gameStart: " + currentQuestionIndex)
}

function judge() {
  if (finishID.length == 2) {
    if (finishID[0].useTime < finishID[1].useTime) {
      io.in(room).emit('room_judge', {userID: finishID[0].userID})
    } else if (finishID[0].useTime > finishID[1].useTime) {
      io.in(room).emit('room_judge', {userID: finishID[1].userID})
    } else {
      io.in(room).emit('room_judge', {userID: ""})
    }
  } else if (finishID.length == 1) {
    io.in(room).emit('room_judge', {userID: finishID[0].userID})
  } else {
    io.in(room).emit('room_judge', {userID: ""})
  }
  clearTimeout(timeoutID)
  timeoutID = setTimeout(gameStart, 2000)
  finishID.length = 0
}

function timeOut() {
  if (currentQuestionIndex == -1) return
  judge()
}