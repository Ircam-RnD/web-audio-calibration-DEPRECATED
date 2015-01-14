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
  gain : 0, // dB
  period : 1000, // milliseconds
  number : -1, // -1 for infinite, > 0 for finite count
  duration : 0.05 // milliseconds (0.05 ms is 2 samples at 44100 Hz)
};

var calibrationFile = __dirname + '/data/web-audio-calibration.json';
var calibrationFileEncoding = 'utf8';
var calibrationData = {};

fs.readFile(calibrationFile, calibrationFileEncoding,
                function(error, data) {
                  if(error) {
                    console.log('Error while reading calibration file: ' +
                                error);
                  } else {
                    calibrationData = JSON.parse(data);
                  }
            });

var clickTimeout; // handle to clear timeout

io.sockets.on('connection', function (socket) {
  // brodacst to initialise controls
  io.emit('server-params', serverParams);

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

    // re-broadcast for multiple control clients
    if(serverParamsChanged) {
      io.emit('server-params', serverParams);
    }

  });

  socket.on('client-params-store', function(params) {
    if(typeof params.userAgent !== 'undefined' &&
       typeof params.delay !== 'undefined' &&
       typeof params.gain !== 'undefined')
    {
      calibrationData[params.userAgent] = {delay : params.delay,
                                           gain : params.gain};
      fs.writeFile(calibrationFile, JSON.stringify(calibrationData));
    }
  });

  socket.on('client-params-request', function(userAgent) {
    if(typeof calibrationData !== 'undefined') {
      var result = calibrationData[userAgent];
      if(typeof result !== 'undefined' &&
         typeof result.delay !== 'undefined' &&
         typeof result.gain !== 'undefined') {
        socket.emit('client-params', {delay : result.delay,
                                      gain : result.gain});
      }
    }
  });
  
}); // io.sockets.on('connection' ...


function click() {
  if(serverParams.active && serverParams.number !== 0) {
    serverParams.number --;
     // broadcast
    io.emit('click', {delay : serverParams.delay,
                      gain : serverParams.gain,
                      duration : serverParams.duration});
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
