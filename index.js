const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
var room = "no1"
var userGroup = []
var joinRoom = []
var currentQuestionIndex = -1
var timeoutID = setTimeout(timeOut, 1)
var finishID = []
var isGameLoadingFinish = false

/**
 * 路由
 */
app.get('/a', (req, res) => {
    res.sendFile(__dirname + '/clientA.html');
});

app.get('/b', (req, res) => {
    res.sendFile(__dirname + '/clientB.html');
});

app.get('/', (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.end("hello worlds");
});

/**
 * socket 事件
 */
io.on('connection', (socket) => {
  console.log('a user connected');

  /**
   * Room
   */
  socket.on('join', (data) => {
    var obj = JSON.parse(data)
    console.log("joined: " + obj.userID)
    socket.join(room)
    if (!joinRoom.find ( it => it == obj.userID)) joinRoom.push(obj.userID)
    if (joinRoom.length == 2) {
      gameStart()
      isGameLoadingFinish = true
    }
  })

  socket.on('room_finish', (data) => {
    var obj = JSON.parse(data)
    console.log("room_finish: " + obj.userID)
    finishID.push({userID: obj.userID, useTime: obj.useTime})
    if (finishID.length == 2) judge()
  })


  socket.on('leave', (data) => {
    isGameLoadingFinish = false
    var obj = JSON.parse(data)
    socket.leave(room)
    userGroup
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
  console.log("gameStart")
  clearTimeout(timeoutID)
  currentQuestionIndex ++
  io.in(room).emit('room_game_start', {index: currentQuestionIndex})
  timeoutID = setTimeout(timeOut, 60000)
}

function judge() {
  if (finishID.length == 2) {
    if (finishID[0].useTime > finishID[1].useTime) {
      io.in(room).emit('room_judge', {userID: finishID[0].userID})
    } else if (finishID[0].useTime < finishID[1].useTime) {
      io.in(room).emit('room_judge', {userID: finishID[1].userID})
    } else {
      io.in(room).emit('room_judge', {userID: ""})
    }
  } else if (finishID.length == 1) {
    io.in(room).emit('room_judge', {userID: finishID[0].userID})
  } else {
    io.in(room).emit('room_judge', {userID: ""})
  }
  timeoutID = setTimeout(gameStart, 2000)
  finishID.length = 0
}

function timeOut() {
  if (currentQuestionIndex == -1) return
  judge()
}