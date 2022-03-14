const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
var room = "no1"

/**
 * 路由
 */
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
  console.log('a user connected');

  /**
   * Room
   */
  socket.on('message', (data) => {
    var obj = JSON.parse(data)
    console.log(obj.userID + ":" + obj.message)
    io.in(room).emit('room', JSON.stringify(obj))
  })

  socket.on('join', (json) => {
    var obj = JSON.parse(json)
    if (obj.userID == "a" || obj.userID == "b") {
      socket.join(room)
      socket.emit('joined', socket.id)
    }
  })

  socket.on('leave', (room) => {
    socket.leave(room)
    socket.to(room).emit('bye', room, socket.id)
    socket.emit('leave', room, socket.id)
  })
 
  /**
   * 全體廣播
   */
  // socket.on('message', (data) => {
  //   var obj = JSON.parse(data)
  //   console.log(obj.userID + ":" + obj.message)
  //   io.emit('all', data)
  // })

});


/**
 * 連線 port 設定
 */
server.listen(8081, () => {
  console.log('listening on *:8081');
});