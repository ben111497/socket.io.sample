/**
 * Class for game
 */

// 房間相關資訊
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
  
// 使用者遊戲資料
class User {
    constructor(userID, socketID, coin, remainTime, status) {
        this.userID = userID;
        this.socketID = socketID;
        this.coin = coin;
        this.remainTime = remainTime;
        this.status = status;
    }
}

// 各房間計時器
class Timer {
    constructor(roomID, timer) {
        this.roomID = roomID;
        this.timer = timer;
    }
}

/**
 * itut req data
 */

// 遊戲結果
// roomID: String, type: Int, draw: Boolean, winner: String, loser: String, _id: String
class GameResultReq {
    constructor(roomID, type, draw, winner, loser, _id) {
        this.roomID = roomID;
        this.type = type;
        this.draw = draw;
        this.winner = winner;
        this.loser = loser;
        this._id = _id;
    }
}

// 遊戲金幣變動
// mode: Int, status: Int, coin: Int
class GameCoinSettleReq {
    constructor(mode, status, coin) {
        this.mode = mode;
        this.status = status;
        this.coin = coin;
    }
}

module.exports = { Game, User, Timer, GameResultReq }