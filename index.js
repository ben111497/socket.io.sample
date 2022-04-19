const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
var roomID = "no1"
var userGroup = []
var joinRoom = []
var finishID = []
var isReady = []

var system = []
var timerGroup = []

const GameMode = Object.freeze({"Racing": 0, "multiplication": 1})
const GameStatus = Object.freeze({"WaitingQuestion": -3, "WaitingAnswer": -2, "Preparing": -1, "Answering": 0, "LeaveSystem": 1, "LeaveSelf": 2})

class Game {
  constructor(roomID, videoID, antes, rates, gameMode, questionIndex, users) {
    this.roomID = roomID;
    this.videoID = videoID;
    this.antes = antes;
    this.rates = rates;
    this.gameMode = gameMode;
    this.questionIndex = questionIndex;
    this.users = users;
  }
}

class User {
  constructor(userID, socketID, coin, remainTime, status) {
    this.userID = userID;
    this.socketID = socketID;
    this.coin = coin;
    this.remainTime = remainTime;
    this.status = status;
  }
}

class Timer {
  constructor(roomID, timer) {
    this.roomID = roomID;
    this.timer = timer;
  }
}

/**
 * 路由
 */
app.get('/', (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.end("hello worlds");
});

// app.get('/a', (req, res) => {
//   res.sendFile(__dirname + '/clientA.html');
// });

// app.get('/b', (req, res) => {
//   res.sendFile(__dirname + '/clientB.html');
// });

/**
 * 連線 port 設定
 */
 server.listen(8082, () => {
  console.log('listening on *:8082');
});

/**
 * socket 事件
 */
io.on('connection', (socket) => {
  console.log('new user connected ' + 'socketID: ' + socket.id);

  /**
   * Join room
   */
  socket.on('join', (data) => {
    var obj = JSON.parse(data)
    
    console.log("---------------------------------------------")1
    console.log("join => userID: " + obj.userID + ", roomID: " + roomID)

    socket.join(roomID)

    var res = {roomID: "no1", userA: "2AB0BCAC0AF7B35AD957540E491256498F31FC20", userB: "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", videoID: "https://www.youtube.com/watch?v=cCOMPI8doc0"}
       
    if (system.find(it => it.roomID == roomID) == undefined) {
      var list = []
      list.push(new User("2AB0BCAC0AF7B35AD957540E491256498F31FC20", "socketID-a", 0, 0, GameStatus.WaitingQuestion))
      list.push(new User("8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", "socketID-b", 0, 0, GameStatus.WaitingQuestion))
      system.push(new Game(roomID, "https://www.youtube.com/watch?v=cCOMPI8doc0", 5, 3, GameMode.Racing, 0, list))
    }   

    io.emit('matched', res)
  })

  /**
   * Room
   */
  socket.on('room_isReady', (data) => {
    var obj = JSON.parse(data)

    console.log("---------------------------------------------")
    console.log("room_isReady => userID: " + obj.userID)

    let user = system.find(it => it.roomID == obj.roomID).users.find(it => it.userID == obj.userID)
    user.coin = obj.coin
    user.status = GameStatus.WaitingAnswer

    const okCount = system.find(it => it.roomID == obj.roomID).users.filter((value) => value.status == GameStatus.WaitingAnswer).length

    if (okCount == 2) {
      gameStart(obj.roomID)
      console.log("Game Start")
    }
  })

  socket.on('room_finish', (data) => {
    var obj = JSON.parse(data)

    console.log("---------------------------------------------")
    console.log("room_finish => userID: " + obj.userID + " roomID: " + obj.roomID)
    
    const user = system.find(it => it.roomID == obj.roomID).users.find(it => it.userID == obj.userID)

    user.remainTime = obj.remainTime
    user.status = GameStatus.WaitingAnswer

    if (system.find(it => it.roomID == obj.roomID).users.filter((value) => value.status == GameStatus.WaitingAnswer).length == 2) { 
      judge(roomID) 
    }
  })

   //以上已修改完成 4/18

  // socket.on('room_leave', (data) => {
  //   var obj = JSON.parse(data)
  //   console.log("room_finish => userID: " + obj.userID)

  //   finishID.push({userID: obj.userID, useTime: obj.useTime})
  //   if (finishID.length == 2) judge(roomID)
  // })

  // socket.on('leave', (data) => {
  //   var obj = JSON.parse(data)
  //   console.log("leave => userID: " + obj.userID)

  //   socket.leave(roomID)
  //   socket.disconnect()
  //   var index = userGroup.indexOf(obj.userID)
  //   if (index != -1) userGroup.splice(index, 1)
  // })

});

/**
 * game function
 */

function gameStart(roomID) {
  let index = system.find(it => it.roomID == roomID)
  index.questionIndex ++

  index.users[0].status = GameStatus.Answering
  index.users[0].remainTime = 60
  index.users[1].status = GameStatus.Answering
  index.users[1].remainTime = 60

  io.in(roomID).emit('room_game_start', {roomID: roomID, index: index.questionIndex})
  
  var timer = setTimeout(() => judge(roomID), 62000)

  const roomTimer = timerGroup.find(it => it.roomID == roomID)
  if (roomTimer == undefined) {
    timerGroup.push(new Timer(roomID, timer))
  } else {
    roomTimer.timer = timer
  }

  console.log("---------------------------------------------")
  console.log("room_game_start => " + "room: ID:" + roomID + ", questionIndex: " + index.questionIndex)
}


function judge(roomID) {
  console.log("---------------------------------------------")
  console.log("judge => roomID: " + roomID)

  const timer = timerGroup.find(it => it.roomID == roomID)
  clearTimeout(timer.timer)

  let info = system.find(it => it.roomID == roomID)
  let userA = info.users[0]
  let userB = info.users[1]
  let coin = info.antes * info.rates

  if (userA.remainTime > userB.remainTime) {
    io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userA.userID})
  } else if (userA.remainTime < userB.remainTime) {
    io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userB.userID})
  } else {
    io.in(roomID).emit('room_judge', {roomID: roomID, coin: 0, winUserID: ""})
  }

  //setTimeout(gameStart(roomID), 2000)
}

function coinSettle() {
  //call api 扣錢加錢
}