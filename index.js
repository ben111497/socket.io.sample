const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { v4: uuidv4 } = require('uuid');

var system = [] //各個房間的玩家基本資料含房間資訊
var timerGroup = [] //存放各個房間的時間倒數計時
var waitingGroup = [] //存放檢查是否還在線倒數計時

/**
 * Enum
 */

//遊戲模式
const GameMode = Object.freeze({"Racing": 0, "multiplication": 1})
//遊戲狀態
const GameStatus = Object.freeze({"WaitingQuestion": -3, "WaitingAnswer": -2, "JudgeCheck": -1, "Answering": 0, "Leave": 1,})
//遊戲結束狀態
const GameConnect = Object.freeze({"Leave": 1, "Bust": 2, "QuestionEnd": 3, "Disconnect": 4})

/**
 * Class
 */

//房間相關資訊
class Game {
  constructor(roomID, videoID, antes, rates, gameMode, questionIndex, questionCount, users) {
    this.roomID = roomID;
    this.videoID = videoID;
    this.antes = antes;
    this.rates = rates;
    this.gameMode = gameMode;
    this.questionIndex = questionIndex;
    this.questionCount = questionCount;
    this.users = users;
  }
}

//使用者遊戲資料
class User {
  constructor(userID, socketID, coin, remainTime, status) {
    this.userID = userID;
    this.socketID = socketID;
    this.coin = coin;
    this.remainTime = remainTime;
    this.status = status;
  }
}

//各房間計時器
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
  console.log("------------------------------------------------------------------------------------------")
  console.log('new user connected ' + 'socketID: ' + socket.id);

  //進入點
  socket.on('join', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "join", obj)

    let roomID = "7c0d991d-d72a-4b2b-a98d-1f64f760730a" //暫時寫死

    socket.join(roomID)

    let res = {roomID: roomID, userA: "2AB0BCAC0AF7B35AD957540E491256498F31FC20", userB: "8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", videoID: "https://www.youtube.com/watch?v=KZbswFDOOsY"}
        
    if (system.find(it => it.roomID == roomID) == undefined) {
      let list = []
      list.push(new User("2AB0BCAC0AF7B35AD957540E491256498F31FC20", "socketID-a", 0, 0, GameStatus.WaitingQuestion))
      list.push(new User("8A88208FCE4862B7541F74D4EADBAAB71F6CBEBE", "socketID-b", 0, 0, GameStatus.WaitingQuestion))
      system.push(new Game(roomID, "https://www.youtube.com/watch?v=KZbswFDOOsY", 5, 3, GameMode.Racing, 0, 10, list))
    }   

    io.emit('matched', res)
    socketLog(false, "matched", res)
  })

  /**
   * Room
   */

  //準備完成
  socket.on('room_isReady', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_isReady", obj)

    system.find(it => it.roomID == obj.roomID).questionCount = obj.questionCount
    
    let user = system.find(it => it.roomID == obj.roomID).users.find(it => it.userID == obj.userID)
    user.coin = obj.coin
    user.status = GameStatus.WaitingAnswer

    if (system.find(it => it.roomID == obj.roomID).users.filter((value) => value.status == GameStatus.WaitingAnswer).length == 2) {
      gameStart(obj.roomID)
      console.log("------------------------------------------------------------------------------------------")
      console.log("<< function -> gameStart =>")
    }
  })

  //答題完成
  socket.on('room_finish', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_finish", obj)
 
    const user = system.find(it => it.roomID == obj.roomID).users.find(it => it.userID == obj.userID)

    user.remainTime = obj.remainTime
    user.status = GameStatus.WaitingAnswer

    if (system.find(it => it.roomID == obj.roomID).users.filter((value) => value.status == GameStatus.WaitingAnswer).length == 2) { 
      judge(obj.roomID) 
    }
  })

  //確認是否還在線
  socket.on('room_judge_check', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_judge_check", obj)

    let info = system.find(it => it.roomID == obj.roomID)
    if (info == undefined) { return }

    info.users.find(it => it.userID == obj.userID).status = GameStatus.WaitingAnswer

    const findTimer = waitingGroup.find(it => it.roomID == obj.roomID)
    if (findTimer == undefined) {
      const timer = setTimeout(() => connectTimeOut(obj.roomID), 5000)
      waitingGroup.push(new Timer(obj.roomID, timer))
    } else {
      clearTimeout(findTimer.timer)
      waitingGroup = waitingGroup.filter (it => it.roomID == obj.roomID)
    }

    if (system.find(it => it.roomID == obj.roomID).users.filter(it => it.status == GameStatus.WaitingAnswer).length == 2) {
      gameStart(obj.roomID)
    }
  })

  //離開遊戲
  socket.on('room_leave', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_leave", obj)

    system.find(it => it.roomID == obj.roomID).users.find(it => it.userID == obj.userID).status = GameStatus.Leave

    userLeaveGame(obj.roomID, obj.userID)
  }) 

});

/**
 * game function
 */

//遊戲開始
function gameStart(roomID) {
  let index = system.find(it => it.roomID == roomID)
  index.questionIndex ++

  index.users[0].status = GameStatus.Answering
  index.users[0].remainTime = 0
  index.users[1].status = GameStatus.Answering
  index.users[1].remainTime = 0

  io.in(roomID).emit('room_game_start', {roomID: roomID, index: index.questionIndex})
  socketLog(false, "room_game_start", {roomID: roomID, index: index.questionIndex})
  
  var timer = setTimeout(() => judge(roomID), 62250)

  const roomTimer = timerGroup.find(it => it.roomID == roomID)
  if (roomTimer == undefined) {
    timerGroup.push(new Timer(roomID, timer))
  } else {
    roomTimer.timer = timer
  }
}

//遊戲結果回傳
function judge(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("judge => roomID: " + roomID)

  const timer = timerGroup.find(it => it.roomID == roomID)
  clearTimeout(timer.timer)

  let info = system.find(it => it.roomID == roomID)
  let userA = info.users[0]
  let userB = info.users[1]
  let coin = info.antes * info.rates

  userA.status = GameStatus.JudgeCheck
  userB.status = GameStatus.JudgeCheck

  console.log("info.questionCount: " + info.questionCount + ", info.questionIndex: " + info.questionIndex)

  setTimeout(() => {
    if (userA.remainTime > userB.remainTime) {
      coinJudge(roomID, userA.userID, userB.userID, coin)
      userA.coin ++
      userB.coin --
      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userA.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userA.userID})

      if (info.questionIndex >= info.questionCount) { 
        questionEnd(roomID) 
      } else if (userB.coin == 0) { 
        coinNotEnough(roomID, userB.userID) 
      }
    } else if (userA.remainTime < userB.remainTime) {
      coinJudge(roomID, userB.userID, userA.userID, coin)
      userA.coin --
      userB.coin ++
      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userB.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userB.userID})

      if (info.questionIndex >= info.questionCount) {
         questionEnd(roomID)
      } else if (userA.coin == 0) { 
        coinNotEnough(roomID, userA.userID) 
      }
    } else {
      io.in(roomID).emit('room_judge', {roomID: roomID, coin: 0, winUserID: ""})
      socketLog(false, "room_judge", {roomID: roomID, coin: 0, winUserID: ""})

      if (info.questionIndex >= info.questionCount) { questionEnd(roomID) }
    }
  }, 1000)
}

// Log
function socketLog(isOn, key, res) {
  console.log("------------------------------------------------------------------------------------------")
  if (isOn) {
    console.log("<< socket.on -> " + key + " >>")
  } else {
    console.log("<< socket.emit -> " + key + " >>")
  }
  console.log(res)
}

//連線逾時
function connectTimeOut(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> connectTimeOut >>")

  waitingGroup = waitingGroup.filter (it => it.roomID != roomID)
  const user = system.find(it => it.roomID == roomID).users.find(it => it.status == GameStatus.JudgeCheck)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  socketLog(false, "room_game_end",  {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  
  system = system.filter(it => it.roomID != roomID)
}

//離開遊戲
function userLeaveGame(roomID, userID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> userLeaveGame >>")

  const timer = timerGroup.find(it => it.roomID == roomID)
  if (timer != undefined) { clearTimeout(timer.timer) }

  const info = system.find(it => it.roomID == roomID)
  const loseUserID = userID
  const winUserID = info.users.find(it => it.userID != userID).userID

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Leave})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Leave})

  coinJudge(roomID, winUserID, loseUserID, info.antes * info.rates)

  system = system.filter(it => it.roomID != roomID)
}

//金額不足
function coinNotEnough(roomID, userID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinNotEnough >>")

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Bust})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Bust})

  waitingGroup = waitingGroup.filter(it => it.roomID != obj.roomID)
  system = system.filter(it => it.roomID != roomID)
}

//題目用完 遊戲結束
function questionEnd(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< questionEnd >>")

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})
  socketLog(false, "room_game_end", {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})

  waitingGroup = waitingGroup.filter(it => it.roomID != roomID)
  system = system.filter(it => it.roomID != roomID)
}

//加扣錢
function coinJudge(roomID, winUserID, loseUserID, coin) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinJudge >>")
  console.log({winUserID: winUserID, loseUserID: loseUserID, coin: coin})
  //call api 扣錢加錢 還沒做
}