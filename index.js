const express = require('express');
const myClass = require('./class')
const axios = require('axios');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { v4: uuidv4 } = require('uuid');

const API_URL = "https://api.italkutalk.com/api/"

var system = [] //各個房間的玩家基本資料含房間資訊
var timerGroup = [] //存放各個房間的時間倒數計時
var waitingGroup = [] //存放檢查是否還在線倒數計時

/**
 * Enum
 */

//遊戲模式
const GameMode = Object.freeze({"Racing": 1, "multiplication": 2})
//遊戲狀態
const GameStatus = Object.freeze({"WaitingQuestion": -3, "WaitingAnswer": -2, "JudgeCheck": -1, "Answering": 0, "Leave": 1,})
//遊戲結束狀態
const GameConnect = Object.freeze({"Leave": 1, "Bust": 2, "QuestionEnd": 3, "Disconnect": 4})
//遊戲結算狀態
const GameResult = Object.freeze({"Win": 0, "Loss": 1, "Draw": 2})

/**
 * 路由
 */
//http://192.168.0.179:8082/
app.get('/', (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
});

app.get('/a', (req, res) => {
  res.sendFile(__dirname + '/clientA.html');
});

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

    let res = {roomID: roomID, userA: "B501D4F601276CA77928E4D7C2C2E61E1D75B8BD", userB: "68F1191C147B0DEFA029C5EB8574FDE7FD14F4B4", videoID: "https://www.youtube.com/watch?v=-aMdBA00Ijc", _id: "60f0185123475d0d204b3605"}
        
    if (system.find(it => it.roomID == roomID) == undefined) {
      let list = []
      list.push(new myClass.User("B501D4F601276CA77928E4D7C2C2E61E1D75B8BD", "socketID-a", 0, 0, GameStatus.WaitingQuestion, 0, 0))
      list.push(new myClass.User("68F1191C147B0DEFA029C5EB8574FDE7FD14F4B4", "socketID-b", 0, 0, GameStatus.WaitingQuestion, 0, 0))
      system.push(new myClass.Game(roomID, "https://www.youtube.com/watch?v=KZbswFDOOsY", 15, 2, GameMode.Racing, 0, 10, list))
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
      waitingGroup.push(new myClass.Timer(obj.roomID, timer))
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
    timerGroup.push(new myClass.Timer(roomID, timer))
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

  var info = system.find(it => it.roomID == roomID)
  var userA = info.users[0]
  var userB = info.users[1]
  let coin = info.antes * info.rates

  userA.status = GameStatus.JudgeCheck
  userB.status = GameStatus.JudgeCheck

  console.log("info.questionCount: " + info.questionCount + ", info.questionIndex: " + info.questionIndex)

  setTimeout(() => {
    if (userA.remainTime > userB.remainTime) {
      userA.coin ++
      userB.coin --

      userA.win ++
      userB.loss ++

      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userA.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userA.userID})

      if (info.questionIndex >= info.questionCount) { 
        questionEnd(roomID) 
      } else if (userB.coin == 0) { 
        coinNotEnough(roomID, userB.userID) 
      }
    } else if (userA.remainTime < userB.remainTime) {
      userA.coin --
      userB.coin ++

      userA.loss ++
      userB.win ++

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
  }, 500)
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

  coinSettlement(roomID)

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

  var info = system.find(it => it.roomID == roomID)
  info.users.find(it => it.userID == userID).loss++
  info.users.find(it => it.userID != userID).win++

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Leave})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Leave})

  system = system.filter(it => it.roomID != roomID)
}

//金額不足
function coinNotEnough(roomID, userID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinNotEnough >>")

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Bust})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Bust})

  waitingGroup = waitingGroup.filter(it => it.roomID != roomID)
  system = system.filter(it => it.roomID != roomID)
}

//題目用完 遊戲結束
function questionEnd(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< questionEnd >>")

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})
  socketLog(false, "room_game_end", {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})

  waitingGroup = waitingGroup.filter(it => it.roomID != roomID)
  system = system.filter(it => it.roomID != roomID)
}

//加扣錢
function coinSettlement(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinSettlement >>")

  let info = system.find(it => it.roomID == roomID)
  let userA = info.users[0]
  let userB = info.users[1]

  //金幣處理 userA
  let userACoin = (userA.win - userA.loss) * info.antes * info.rates

  if (userACoin > 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 0, 2, userACoin))
  } else if (userACoin < 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 1, 2, -userACoin))
  }

  //金幣處理 userB
  let userBCoin = (userB.win - userB.loss) * info.antes * info.rates

  if (userBCoin > 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userB.userID, 0, 2, userBCoin))
  } else if (userBCoin < 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userB.userID, 1, 2, -userBCoin))
  }

  //比賽結果回傳
  let winUserID = ""
  let lossUserID = ""
  let draw = false

  if (userA.win > userB.win) {
    winUserID = userA.userID
    lossUserID = userB.userID

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: winUserID, coin: userACoin, status: GameResult.Win})
    socketLog(false, "room_game_result", {roomID: roomID, userID: winUserID, coin: userACoin, status: GameResult.Win})

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: lossUserID, coin: -userBCoin , status: GameResult.Loss})
    socketLog(false, "room_game_result", {roomID: roomID, userID: lossUserID, coin: -userBCoin ,status: GameResult.Loss})
  } else if (userA.win < userB.win) {
    winUserID = userB.userID
    lossUserID = userA.userID

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: lossUserID, coin: -userACoin, status: GameResult.Loss})
    socketLog(false, "room_game_result", {roomID: roomID, userID: lossUserID, coin: -userACoin, status: GameResult.Loss})

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: winUserID, coin: userBCoin, status: GameResult.Win})
    socketLog(false, "room_game_result", {roomID: roomID, userID: winUserID, coin: userBCoin, status: GameResult.Win})
  } else {
    winUserID = userA.userID
    lossUserID = userB.userID
    draw = true

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: "", coin: 0, status: GameResult.Draw})
    socketLog(false, "room_game_result", {roomID: roomID, userID: "", coin: 0, status: GameResult.Draw})
  }

  httpPost("game/result", new myClass.GameResultReq(roomID, info.gameMode, draw, winUserID, lossUserID, ""))
}

/**
 * API 相關
 */

async function httpPost(url, data) {
  async function post() {
    try { 
      apiConsole(true, API_URL + url, data)
      return await axios.post(API_URL + url, data).then(response => response.data)
    } catch(error) {
      console.log(error)
    }
  }

  let temp = await post();
  apiConsole(false, API_URL + url, temp)
}

function apiConsole(isReq, httpUrl, data) {
  let status

  if (isReq) { 
    status = "Request"
  } else { 
    status = "Response"
  }

  console.log("------------------------------------------------------------------------------------------")
  console.log(status + " => " + httpUrl)
  console.log(data)
}