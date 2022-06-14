/**
 * ==================================================== Class for game ====================================================
 */

// 遊戲配對
// socketID: String, userID: String, language: Int, antes: Int, gameMode: GameStatus
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

//遊戲配對確認
//user: Array<String>, language: Int, timer: Timer
class GamePairingCheck {
    constructor(roomID, users, checkedUser, language, timer) {
        this.roomID = roomID;
        this.users = users;
        this.checkedUser = checkedUser;
        this.language = language;
        this.timer = timer;
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
    constructor(userID, socketID, originCoin, currentCoin, remainTime, status, win, loss) {
        this.userID = userID;
        this.socketID = socketID;
        this.originCoin = originCoin;
        this.currentCoin = currentCoin;
        this.remainTime = remainTime;
        this.status = status;
        this.win = win;
        this.loss = loss;
    }
}

// 使用者遊戲資料 格式：Map -> ker: roomID, value: GameJudgeCheck
// users: ArrayList<String>, timer: Timer
class GameJudgeCheck {
    constructor(users, timer) {
        this.users = users;
        this.timer = timer;
    }
}

// 遊戲結果回傳 room
// roomID: String, userID: String, originCoin: Int, currentCoin: Int, status: Int
class GameResult {
    constructor(roomID, userID, originCoin, currentCoin, status) {
        this.roomID = roomID;
        this.userID = userID;
        this.originCoin = originCoin;
        this.currentCoin = currentCoin;
        this.status = status;
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
// roomID: String, language: Int
class GameQuestionGetReq {
    constructor(roomID, language) {
        this.roomID = roomID;
        this.language = language;
    }
}

/**
 * ==================================================== module.exports ====================================================
 */

module.exports = { GamePairing, GamePairingCheck, Game, User, GameJudgeCheck, GameResult, GameResultReq, GameCoinSettleReq, GameQuestionGetReq }