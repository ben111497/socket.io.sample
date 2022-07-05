const express = require('express');
const myClass = require('./class');
const axios = require('axios');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { v4: uuidv4 } = require('uuid');
const { jsonp, json } = require('express/lib/response');

const API_URL = "https://api.italkutalk.com/api/"

const system = new Map() //各個房間的玩家基本資料含房間資訊 <key: String, value: Game>
const timerGroup = new Map() //存放各個房間的時間倒數計時 <key: String, value: timer>
const waitingGroup = new Map() //存放檢查是否還在線倒數計時 <key: String, value: timer>

var pairingCheckGroup = []; //確認配對中的人是否存在 <key: String, value: timer>
var pairingGroup = []; //配對資料，正常連線後，儲存 socket.id 對應到的 userID 及 roomID，斷線後清除 <class: GamePairing>

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
//異常狀態
const GameError = Object.freeze({"RepeatConnection": 0, "Gaming": 1, "JudgeCheckTimeOut": 2, "NotExist": 3})

/**
 * 路由
 */
//http://192.168.0.179:8082/
app.get('/', (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
});

//導向網頁 "沒有功能"
app.get('/a', (req, res) => {
  res.sendFile(__dirname + '/clientA.html');
});

//get 方式使用 userID 移除列隊
//http://192.168.0.179:8082/pairing/remove?userID=...
app.get('/pairing/remove', (req, res) => {
  let url = new URL(API_URL + req._parsedUrl.href)
  let userID = url.searchParams.get('userID')
  let data = pairingGroup.find(it => it.userID == userID)

  if (data === undefined) {
    res.send("Not found")
  } else {
    io.to(data.socketID).emit('system_reset', {userID: data.userID})
    res.send(`Remove data: ${JSON.stringify(data)}`)
    pairingGroup = pairingGroup.filter(it => it.userID != userID)
  }
});

//取得列隊中的使用者資料
//http://192.168.0.179:8082/pairing/info
app.get('/pairing/info', (req, res) => {
  res.send(pairingGroup)
})

//清除全部列隊中的玩家
//http://192.168.0.179:8082/pairing/reset
app.get('/pairing/reset', (req, res) => {
  for (let i of pairingGroup) {
    io.to(i.socketID).emit('system_reset', {userID: i.userID})
  }
  pairingGroup = []
  res.send("restart")
})

//取得遊戲中的使用者資料
//http://192.168.0.179:8082/gaming/info
app.get('/gaming/info', (req, res) => {
  res.send(system)
})

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

  socket.emit("connected", {});

/**
 * Pairing
 */
  //加入配對
  socket.on("join_pairing", (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "join_pairing", obj)

    // 判斷是否已在遊戲中
    if (system.size >= 1) {
      for (let [_, value] of system) {
        if (value.users.some(it => it.userID == obj.userID)) {
          socket.emit("error", {status: GameError.Gaming})
          return 
        }
      }
    }

    // 是否已存在配對中，新來的會把舊的踢除
    let info = pairingGroup.find(it => it.userID == obj.userID)
    if (info != undefined) {
      io.to(info.socketID).emit("error", {status: GameError.RepeatConnection})
      pairingGroup = pairingGroup.filter(it => it.userID != obj.userID)
      socketLog(false, "error", {status: GameError.RepeatConnection})
    }

    let gameMode
    if (obj.gameMode == 2) {
      gameMode = GameMode.Multiplication
    } else {
      gameMode = GameMode.Racing
    }

    pairingGroup.push(new myClass.GamePairing(socket.id, obj.userID, obj.language, obj.antes, obj.rates, obj.coin, gameMode))

    let opponent = pairingGroup.find(it => it.userID != obj.userID && it.language == obj.language 
      && it.antes == obj.antes && it.gameMode == gameMode && !pairingCheckGroup.some(it => it.userA == obj.userID || it.userB == obj.user))
    if (opponent != undefined) {
          let roomID = uuidv4()
          let list = []
          list.push(new myClass.User(obj.userID, socket.id, obj.coin, obj.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          list.push(new myClass.User(opponent.userID, opponent.socketID, opponent.coin, opponent.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          system.set(roomID, new myClass.Game("", obj.antes, obj.rates, gameMode, 0, 1, list))
          
          let timer = setTimeout(() => pairingCheckTimeOut(roomID, obj.userID, opponent.userID), 3000)
          pairingCheckGroup.push(new myClass.GamePairingCheck(roomID, [obj.userID, opponent.userID], [], obj.language, timer))

          socket.emit('pairing_check', {roomID: roomID})
          io.to(opponent.socketID).emit('pairing_check', {roomID: roomID})
          socketLog(false, "pairing_check", {roomID: roomID})
    }
  })

  //經由玩家確認過後強制剔除遊戲中玩家，並加入列隊
  socket.on('force_join', (data) => {
    let obj = JSON.parse(data)
    
    //踢除動作處理
    for (let [roomID, value] of system) {
      if (value.users.some(it => it.userID == obj.userID)) {
        system.get(roomID).users.find(it => it.userID == obj.userID).status = GameStatus.Leave
        userLeaveGame(roomID, obj.userID, true)
        break;
      }
    }

    //加入列隊處理
    let gameMode
    if (obj.gameMode == 2) {
      gameMode = GameMode.Multiplication
    } else {
      gameMode = GameMode.Racing
    }

    pairingGroup.push(new myClass.GamePairing(socket.id, obj.userID, obj.language, obj.antes, obj.rates, obj.coin, gameMode))

    let opponent = pairingGroup.find(it => it.userID != obj.userID && it.language == obj.language 
      && it.antes == obj.antes && it.gameMode == gameMode && !pairingCheckGroup.some(it => it.userA == obj.userID || it.userB == obj.user))

    if (opponent != undefined) {
          let roomID = uuidv4()

          let list = []
          list.push(new myClass.User(obj.userID, socket.id, obj.coin, obj.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          list.push(new myClass.User(opponent.userID, opponent.socketID, opponent.coin, opponent.coin, 0, GameStatus.WaitingQuestion, 0, 0))
          system.set(roomID, new myClass.Game("", obj.antes, obj.rates, gameMode, 0, 1, list))
          
          let timer = setTimeout(() => pairingCheckTimeOut(roomID, obj.userID, opponent.userID), 3000)
          pairingCheckGroup.push(new myClass.GamePairingCheck(roomID, [obj.userID, opponent.userID], [], obj.language, timer))

          socket.emit('pairing_check', {roomID: roomID})
          io.to(opponent.socketID).emit('pairing_check', {roomID: roomID})
          socketLog(false, "pairing_check", {roomID: roomID})
    }
  })

  //確認配對者是否有回應，前端有時候週期會出錯沒有退出連線
  // data => userID: String, roomID: String
  socket.on('pairing_check', (data) => {
    let obj = JSON.parse(data)

    let room = pairingCheckGroup.find(it => it.roomID == obj.roomID)

    if (room === undefined) { return }
    if (room.checkedUser.some(it => it == obj.userID)) { return }
    room.checkedUser.push(obj.userID)

    if (room.checkedUser.length == 2) {
      clearTimeout(room.timer)
      pairingGroup = pairingGroup.filter(it => it.userID != room.users[0] && it.userID != room.users[1])
      pairingCheckGroup = pairingCheckGroup.filter(it => it.roomID != obj.roomID)
      httpPost("game/question/get", new myClass.GameQuestionGetReq(obj.roomID, room.language))
    }
  }) 

  //加入房間
  socket.on('join_room', (data) => {
    let obj = JSON.parse(data)
    socket.join(obj.roomID)
    log("join_room", data)
  })

  //配對成功前離開
  socket.on('leave', (data) => {
    let obj = JSON.parse(data)
    pairingGroup = pairingGroup.filter(it => it.userID != obj.userID)
    socketLog(true, "leave", data)
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
    user.originCoin = obj.coin
    user.currentCoin = obj.coin
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

    let waitingRoom = waitingGroup.get(obj.roomID)
    if (waitingRoom === undefined) { 
      socket.emit("error", {status: GameError.JudgeCheckTimeOut})
      return 
    }

    let room = system.get(obj.roomID)
    if (room === undefined) { 
      socket.emit("error", {status: GameError.NotExist})
      return
    }

    room.users.find(it => it.userID == obj.userID).status = GameStatus.WaitingAnswer

    if (!waitingRoom.users.some(it => it == obj.userID)) { waitingRoom.users.push(obj.userID) } 
    if (waitingRoom.users.length == 2) {
      clearTimeout(waitingRoom.timer)
      waitingGroup.delete(obj.roomID)
      gameStart(obj.roomID)
    }
  })

  //離開遊戲
  socket.on('room_leave', (data) => {
    let obj = JSON.parse(data)
    socketLog(true, "room_leave", obj)

    let room = system.get(obj.roomID)
    if (room === undefined) { 
      socket.emit("error", {status: GameError.NotExist})
      return 
    }

    room.users.find(it => it.userID == obj.userID).status = GameStatus.Leave

    userLeaveGame(obj.roomID, obj.userID, false)
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
  if (room === undefined) { 
    socket.emit("error", {status: GameError.NotExist})
    return
  }

  var userA = room.users[0]
  var userB = room.users[1]
  let coin = room.rates  //金額待定

  userA.status = GameStatus.JudgeCheck
  userB.status = GameStatus.JudgeCheck

  console.log("room.questionCount: " + room.questionCount + ", room.questionIndex: " + room.questionIndex)

  setTimeout(() => {
    if (userA.remainTime > userB.remainTime) {
      userA.currentCoin += coin
      userB.currentCoin -= coin

      userA.win ++
      userB.loss ++

      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userA.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userA.userID})

      if (room.questionIndex >= room.questionCount) { 
        questionEnd(roomID) 
      } else if (userB.currentCoin <= 0) { 
        coinNotEnough(roomID, userB.userID) 
        userB.currentCoin = 0
      } else {
        const timer = setTimeout(() => connectTimeOut(roomID), 5000)
        waitingGroup.set(roomID, new myClass.GameJudgeCheck([], timer))
      }
    } else if (userA.remainTime < userB.remainTime) {
      userA.currentCoin -= coin
      userB.currentCoin += coin

      userA.loss ++
      userB.win ++

      io.in(roomID).emit('room_judge', {roomID: roomID, coin: coin, winUserID: userB.userID})
      socketLog(false, "room_judge", {roomID: roomID, coin: coin, winUserID: userB.userID})

      if (room.questionIndex >= room.questionCount) {
         questionEnd(roomID)
      } else if (userA.currentCoin <= 0) { 
        coinNotEnough(roomID, userA.userID) 
        userA.currentCoin = 0
      } else {
        const timer = setTimeout(() => connectTimeOut(roomID), 5000)
        waitingGroup.set(roomID, new myClass.GameJudgeCheck([], timer))
      }
    } else {
      io.in(roomID).emit('room_judge', {roomID: roomID, coin: 0, winUserID: ""})
      socketLog(false, "room_judge", {roomID: roomID, coin: 0, winUserID: ""})

      if (room.questionIndex >= room.questionCount) { 
        questionEnd(roomID) 
      } else {
        const timer = setTimeout(() => connectTimeOut(roomID), 5000)
        waitingGroup.set(roomID, new myClass.GameJudgeCheck([], timer))
      }
    }
  }, 500)
}

//連線逾時
function connectTimeOut(roomID) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> connectTimeOut >>")

  waitingRoom = waitingGroup.get(roomID)
  if (waitingRoom != undefined) {
    clearTimeout(waitingRoom.timer)
    waitingGroup.delete(roomID)
  }

  let room = system.get(roomID)
  if (room === undefined) { return }

  const user = room.users.find(it => it.status == GameStatus.JudgeCheck)

  coinSettlement(roomID)

  io.in(roomID).emit('room_game_end', {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  socketLog(false, "room_game_end",  {roomID: roomID, userID: user.userID, status: GameConnect.Disconnect})
  
  system.delete(roomID)
}

function pairingCheckTimeOut(roomID, userA, userB) {
  system.delete(roomID)

  let room = pairingCheckGroup.find(it => it.roomID == roomID)
  if (room === undefined) { return }

  clearTimeout(room.timer)

  if (!room.checkedUser.some(it => it == userA)) pairingGroup = pairingGroup.filter(it => it.userID != userA)
  if (!room.checkedUser.some(it => it == userB)) pairingGroup = pairingGroup.filter(it => it.userID != userB)

  pairingCheckGroup = pairingCheckGroup.filter(it => it.roomID != roomID)
}

//離開遊戲
function userLeaveGame(roomID, userID, isForceLeave) {
  console.log("------------------------------------------------------------------------------------------")
  console.log("<< function -> userLeaveGame >>")

  if (timerGroup.has(roomID)) { clearTimeout(timerGroup.get(roomID)) }

  let room = system.get(roomID)
  if (room === undefined) { return }

  let leaveUser = room.users.find(it => it.userID == userID)
  let otherUser = room.users.find(it => it.userID != userID)

  leaveUser.loss++
  otherUser.win++

  leaveUser.currentCoin -= room.rates  //金額待定
  otherUser.currentCoin += room.rates  //金額待定

  coinSettlement(roomID)

  if (isForceLeave) {
    io.to(leaveUser.socketID).emit('force_leave', {roomID: roomID, userID: userID, status: GameConnect.Leave})
    io.to(otherUser.socketID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Leave})
  } else {
    io.in(roomID).emit('room_game_end', {roomID: roomID, userID: userID, status: GameConnect.Leave})
  }

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
  if (userA.currentCoin > 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 0, 2, userA.currentCoin - userA.originCoin))
  } else if (userA.currentCoin <= 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userA.userID, 1, 2, userA.originCoin - userA.currentCoin))
    userA.currentCoin = 0
  }

  //金幣處理 userB
  if (userB.currentCoin > 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userB.userID, 0, 2, userB.currentCoin - userB.originCoin))
  } else if (userB.currentCoin <= 0) {
    httpPost("game/coin/settle", new myClass.GameCoinSettleReq(userB.userID, 1, 2, userB.originCoin - userB.currentCoin))
    userB.currentCoin = 0
  }

  //比賽結果回傳
  let winUser
  let lossUser
  let draw = false
  let winStatus = GameResult.Win 
  let lossStatus = GameResult.Loss

  if (userA.win > userB.win) {
    winUser = userA
    lossUser = userB
  } else if (userA.win < userB.win) {
    winUser = userB
    lossUser = userA
  } else {
    winUser = userA
    lossUser = userB
    draw = true
    winStatus = GameResult.Draw 
    lossStatus = GameResult.Draw
  }

  let winData = new myClass.GameResult(roomID, winUser.userID, winUser.originCoin, winUser.currentCoin, winStatus)
  io.to(winUser.socketID).emit('room_game_result', winData)
  socketLog(false, "room_game_result", winData)

  let loassData = new myClass.GameResult(roomID, lossUser.userID, lossUser.originCoin, lossUser.currentCoin, lossStatus)
  io.to(lossUser.socketID).emit('room_game_result', loassData)
  socketLog(false, "room_game_result", loassData)

  httpPost("game/result", new myClass.GameResultReq(roomID, room.gameMode, draw, winUser.userID, lossUser.userID, ""))
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
  console.log(`<< ${key} >>`)
  console.log(res)
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
      pairingCheckGroup = pairingCheckGroup.filter(it => it.roomID != obj.roomID)

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