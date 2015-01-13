// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;
var fs = require('fs');
var path = require('path');

server.listen(port, function() {
  console.log('Server listening at port %d', port);
});

app.set('view engine', 'jade');
app.use(express.static(path.join(__dirname, '/public')));

app.get('/', function(req, res) {
  res.render('calibration');
});

app.get('/ctl', function(req, res) {
  res.render('control');
});

// public parameters
var serverParams = {
  active : true, // run by default
  delay : 100, // millisecond
  period : 1000, // milliseconds
  number : -1, // -1 for infinite, > 0 for finite count
  duration : 0.05 // milliseconds (0.05 ms is 2 samples at 44100 Hz)
};

var clickTimeout; // handle to clear timeout

io.sockets.on('connection', function (socket) {
  // brodacst to initialise controls
  io.emit('server-params', serverParams);
  // io.emit('client-params', clientParams);

  socket.on('server-params', function(params) {
    var serverParamsChanged = false;
    var activate = !serverParams.active && params.active;

    for(var key in params) {
      serverParamsChanged = serverParamsChanged ||
        (serverParams[key] === params[key]);
      serverParams[key] = params[key];
    }
    
    if(!serverParams.active || serverParams.number === 0) {
      serverParams.active = false;
      clearTimeout(clickTimeout);
      serverParamsChanged = true;
    } else if(activate) {
      click();
    }

    if(serverParamsChanged) {
      io.emit('server-params', serverParams);
    }

  });
  
});


function click() {
  if(serverParams.active && serverParams.number !== 0) {
    serverParams.number --;
    io.emit('click', {delay : serverParams.delay,
                      duration : serverParams.duration}); // broadcast
  }

  if(serverParams.active)
    if (serverParams.number !== 0) {
      clickTimeout = setTimeout(click, serverParams.period);
    } else {
      serverParams.active = false;
    }  

  // TODO: limit broadcast to control clients
  io.emit('server-params', serverParams);
}

// run by default
click();
