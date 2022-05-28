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

const system = new Map() //各個房間的玩家基本資料含房間資訊
const timerGroup = new Map() //存放各個房間的時間倒數計時
const waitingGroup = new Map() //存放檢查是否還在線倒數計時
var pairingGroup = []; //配對資料，正常連線後，儲存 socket.id 對應到的 userID 及 roomID，斷線後清除

/**
 * Enum
 */

//遊戲模式
const GameMode = Object.freeze({"Racing": 1, "Multiplication": 2})
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
  console.log('user connected ' + 'socketID: ' + socket.id);
  console.log('time' + new Date())

/**
 * Pairing
 */

  socket.on("join_pairing", (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "join_pairing", obj)

    if (system.size >= 1) {
      // 判斷是否已在遊戲中
      for (let [_, data] of system) {
        const { userA, userB } = data;

        if (userA === obj.userID || userB === obj.userID) {
          console.log(`${obj.userID} Repeat pairing`)
          socket.emit("error", {errorMessage: "Repeat pairing"})
          socket.disconnect()
          return  
        }
      }
    }
    // 是否已存在配對中，單一使用者同時只能配對一個
    if (pairingGroup.some(it => it.user == obj.userID)) {
      console.log(`${obj.userID} Repeat connection`)
      socket.emit("error", {errorMessage: "Repeat connection"})
      socket.disconnect()
      return
    }

    let gameMode
    if (obj.gameMode == 2) {
      gameMode = GameMode.Multiplication
    } else {
      gameMode = GameMode.Racing
    }

    pairingGroup.push(new myClass.GamePairing(socket.id, obj.userID, obj.language, obj.antes, obj.rates, obj.coin, gameMode))

    let opponent = pairingGroup.find(it => it.userID != obj.userID && it.language == obj.language && it.antes == obj.antes && it.gameMode == gameMode)
    console.log(pairingGroup)
    if (opponent != undefined) {
          let roomID = uuidv4();

          let list = []
          list.push(new myClass.User(obj.userID, socket.id, obj.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          list.push(new myClass.User(opponent.userID, opponent.socketID, opponent.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          system.set(roomID, new myClass.Game("", obj.antes, obj.rates, gameMode, 0, 1, list))
          
          pairingGroup = pairingGroup.filter(it => it.userID != obj.userID || it.userID != opponent.userID)

          httpPost("game/question/get", new myClass.GameQuestionGetReq(roomID, obj.language))
    }
  })

  //加入房間
  socket.on('join_room', (data) => {
    let obj = JSON.parse(data)
    socket.join(obj.roomID)
    log("join_room", data)
  })

  /**
   * Room (After pairing)
   */

  //準備完成
  socket.on('room_isReady', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_isReady", obj)

    let room = system.get(obj.roomID)
    if (room === undefined) { return }

    room.questionCount = obj.questionCount
    let user = room.users.find(it => it.userID == obj.userID)
    user.coin = obj.coin
    user.status = GameStatus.WaitingAnswer

    if (room.users.filter((value) => value.status == GameStatus.WaitingAnswer).length == 2) {
      gameStart(obj.roomID)
      console.log("------------------------------------------------------------------------------------------")
      console.log("<< function -> gameStart =>")
    }
  })

  //答題完成
  socket.on('room_finish', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_finish", obj)

    let room = system.get(obj.roomID)
    if (room === undefined) { return }

    const user = room.users.find(it => it.userID == obj.userID)
    user.remainTime = obj.remainTime
    user.status = GameStatus.WaitingAnswer

    if (room.users.filter((value) => value.status == GameStatus.WaitingAnswer).length == 2) { 
      judge(obj.roomID) 
    }
  })

  //確認是否還在線
  socket.on('room_judge_check', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_judge_check", obj)

    let room = system.get(obj.roomID)
    if (room === undefined) { return }

    room.users.find(it => it.userID == obj.userID).status = GameStatus.WaitingAnswer

    if (waitingGroup.has(obj.roomID)) {
      clearTimeout(waitingGroup.get(obj.roomID))
      waitingGroup.delete(obj.roomID)
    } else {
      const timer = setTimeout(() => connectTimeOut(obj.roomID), 5000)
      waitingGroup.set(obj.roomID, timer)
    }

    if (room.users.filter(it => it.status == GameStatus.WaitingAnswer).length == 2) {
      gameStart(obj.roomID)
    }
  })

  //離開遊戲
  socket.on('room_leave', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_leave", obj)

    let room = system.get(obj.roomID)
    if (room === undefined) { return }

    room.users.find(it => it.userID == obj.userID).status = GameStatus.Leave

    userLeaveGame(obj.roomID, obj.userID)
  }) 

});

/**
 * game function
 */

//遊戲開始
function gameStart(roomID) {
  let room = system.get(roomID)
  if (room === undefined) { return }

  room.questionIndex ++

  room.users[0].status = GameStatus.Answering
  room.users[0].remainTime = 0
  room.users[1].status = GameStatus.Answering
  room.users[1].remainTime = 0

  io.in(roomID).emit('room_game_start', {roomID: roomID, index: room.questionIndex})
  socketLog(false, "room_game_start", {roomID: roomID, index: room.questionIndex})
  
  timerGroup.set(roomID, setTimeout(() => judge(roomID), 62250))
}

//遊戲結果回傳
function judge(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("judge => roomID: " + roomID)

  if (timerGroup.has(roomID)) {
    clearTimeout(timerGroup.get(roomID))
  }
 
  let room = system.get(roomID)
  if (room === undefined) { return }

  var userA = room.users[0]
  var userB = room.users[1]
  let coin = room.antes * room.rates

  userA.status = GameStatus.JudgeCheck
  userB.status = GameStatus.JudgeCheck

  console.log("room.questionCount: " + room.questionCount + ", room.questionIndex: " + room.questionIndex)

  setTimeout(() => {
    if (userA.remainTime > userB.remainTime) {
      userA.coin ++
      userB.coin --

      userA.win ++
      userB.loss ++

      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userA.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userA.userID})

      if (room.questionIndex >= room.questionCount) { 
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

      if (room.questionIndex >= room.questionCount) {
         questionEnd(roomID)
      } else if (userA.coin == 0) { 
        coinNotEnough(roomID, userA.userID) 
      }
    } else {
      io.in(roomID).emit('room_judge', {roomID: roomID, coin: 0, winUserID: ""})
      socketLog(false, "room_judge", {roomID: roomID, coin: 0, winUserID: ""})

      if (room.questionIndex >= room.questionCount) { questionEnd(roomID) }
    }
  }, 500)
}

//連線逾時
function connectTimeOut(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> connectTimeOut >>")

  waitingGroup.delete(roomID)

  let room = system.get(roomID)
  if (room === undefined) { return }

  const user = room.users.find(it => it.status == GameStatus.JudgeCheck)

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  socketLog(false, "room_game_end",  {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  
  system.delete(roomID)
}

//離開遊戲
function userLeaveGame(roomID, userID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> userLeaveGame >>")

  if (timerGroup.has(roomID)) {
    clearTimeout(timerGroup.get(roomID))
  }

  let room = system.get(roomID)
  if (room === undefined) { return }

  room.users.find(it => it.userID == userID).loss++
  room.users.find(it => it.userID != userID).win++

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Leave})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Leave})

  system.delete(roomID)
}

//金額不足
function coinNotEnough(roomID, userID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinNotEnough >>")

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Bust})
  socketLog(false, "room_game_end", {roomID: roomID, userID: userID, status: GameConnect.Bust})

  waitingGroup.delete(roomID)
  system.delete(roomID)
}

//題目用完 遊戲結束
function questionEnd(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< questionEnd >>")

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})
  socketLog(false, "room_game_end", {roomID: roomID, userID: "", status: GameConnect.QuestionEnd})

  waitingGroup.delete(roomID)
  system.delete(roomID)
}

//加扣錢
function coinSettlement(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> coinSettlement >>")

  let room = system.get(roomID)
  if (room === undefined) { return }

  let userA = room.users[0]
  let userB = room.users[1]

  //金幣處理 userA
  let userACoin = (userA.win - userA.loss) * room.antes * room.rates
  let userAOriginCoin = userA.coin

  if (userACoin > 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 0, 2, userACoin))
  } else if (userACoin < 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 1, 2, -userACoin))
  }

  //金幣處理 userB
  let userBCoin = (userB.win - userB.loss) * room.antes * room.rates
  let userBOriginCoin = userB.coin

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

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: winUserID, originCoin: userAOriginCoin, coin: userACoin, status: GameResult.Win})
    socketLog(false, "room_game_result", {roomID: roomID, userID: winUserID, originCoin: userAOriginCoin, coin: userACoin, status: GameResult.Win})

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: lossUserID, originCoin: userBOriginCoin, coin: -userBCoin , status: GameResult.Loss})
    socketLog(false, "room_game_result", {roomID: roomID, userID: lossUserID, originCoin: userBOriginCoin, coin: -userBCoin ,status: GameResult.Loss})
  } else if (userA.win < userB.win) {
    winUserID = userB.userID
    lossUserID = userA.userID

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: lossUserID, originCoin: userAOriginCoin, coin: -userACoin, status: GameResult.Loss})
    socketLog(false, "room_game_result", {roomID: roomID, userID: lossUserID, originCoin: userAOriginCoin, coin: -userACoin, status: GameResult.Loss})

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: winUserID, originCoin: userBOriginCoin, coin: userBCoin, status: GameResult.Win})
    socketLog(false, "room_game_result", {roomID: roomID, userID: winUserID, originCoin: userBOriginCoin, coin: userBCoin, status: GameResult.Win})
  } else {
    winUserID = userA.userID
    lossUserID = userB.userID
    draw = true

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: lossUserID, originCoin: userAOriginCoin, coin: 0, status: GameResult.Draw})
    socketLog(false, "room_game_result", {roomID: roomID, userID: lossUserID, originCoin: userAOriginCoin, coin: 0, status: GameResult.Draw})

    io.in(roomID).emit('room_game_result', {roomID: roomID, userID: winUserID, originCoin: userBOriginCoin, coin: 0, status: GameResult.Draw})
    socketLog(false, "room_game_result", {roomID: roomID, userID: winUserID, originCoin: userBOriginCoin, coin: 0, status: GameResult.Draw})
  }

  httpPost("game/result", new myClass.GameResultReq(roomID, room.gameMode, draw, winUserID, lossUserID, ""))
}

/**
 * other function
 */

// Log for socket funciotn
function socketLog(isOn, key, res) {
  console.log("------------------------------------------------------------------------------------------")
  if (isOn) {
    console.log("<< socket.on -> " + key + " >>")
  } else {
    console.log("<< socket.emit -> " + key + " >>")
  }
  console.log(res)
}

// Log for common function
function log(key, res) {
  console.log("------------------------------------------------------------------------------------------")
  console.log(`<< ${key} >>\n${res}`)
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

  var temp = await post()
  ResponseData(url, temp)
}

function ResponseData(url, obj) {
  apiConsole(false, API_URL + url, obj)
  switch (url) {
    case 'game/question/get':
      let room = system.get(obj.roomID)

      if (room === undefined) { return }
      let data = {roomID: obj.roomID, userA: room.users[0].userID, userB: room.users[1].userID, videoID: obj.videoID, _id: obj._id}
      io.to(room.users[0].socketID).emit("matched", data)
      io.to(room.users[1].socketID).emit("matched", data)
      socketLog(false, "matched", data)

      break;

    default:
      break;
  }
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