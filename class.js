/**
 * ==================================================== Class for game ====================================================
 */

// 遊戲配對
// socketId: String, userID: String, language: Int, antes: Int, gameMode: GameStatus
class GamePairing {
    constructor(socketID, userID, language, antes, rates, coin, gameMode) {
        this.socketID = socketID;
        this.userID = userID;
        this.language = language;
        this.antes = antes;
        this.rates = rates;
        this.coin = coin;
        this.gameMode = gameMode;
    }
}

// 房間相關資訊 格式：Map -> key: roomID, valuse: GamePairing
// roomID: String, videoID: String, antes: Int, rates: Int, gameMode: GameStatus, questionIndex: Int, questionCount: Int, users: Array<User>
class Game {
    constructor(videoID, antes, rates, gameMode, questionIndex, questionCount, users) {
        this.videoID = videoID;
        this.antes = antes;
        this.rates = rates;
        this.gameMode = gameMode;
        this.questionIndex = questionIndex;
        this.questionCount = questionCount;
        this.users = users;
    }
}
  
// 使用者遊戲資料 格式：Array
// userID: String, socketID: String, coin: Int, remainTime: Int, status: GameStatus
class User {
    constructor(userID, socketID, coin, remainTime, status, win, loss) {
        this.userID = userID;
        this.socketID = socketID;
        this.coin = coin;
        this.remainTime = remainTime;
        this.status = status;
        this.win = win;
        this.loss = loss;
    }
}

/**
 * ==================================================== itut req data ====================================================
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
    constructor(userID, mode, status, coin) {
        this.userID = userID;
        this.mode = mode;
        this.status = status;
        this.coin = coin;
    }
}

// 取得題目
// roomID: String, languae: Int
class GameQuestionGetReq {
    constructor(roomID, languae) {
        this.roomID = roomID;
        this.languae = languae;
    }
}

/**
 * ==================================================== module.exports ====================================================
 */

module.exports = { GamePairing, Game, User, GameResultReq, GameCoinSettleReq, GameQuestionGetReq }