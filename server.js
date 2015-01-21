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
  delay : 200, // millisecond
  gain : 0, // dB
  period : 1000, // milliseconds
  number : -1, // -1 for infinite, > 0 for finite count
  duration : 0.05 // milliseconds (0.05 ms is 2 samples at 44100 Hz)
};

var calibrationPath = __dirname + '/data';
var calibrationFile = calibrationPath + '/' + 'web-audio-calibration.json';
var calibrationFileEncoding = 'utf8';
var calibrationData = {};

try {
  fs.mkdirSync(calibrationPath);
    console.log('Creating data directory: ' + calibrationPath);
} catch (error) {
  if(error.code === 'EEXIST') {
    console.log('Using existing data directory: ' + calibrationPath);
  }
  else {
    console.log('Error creating data directory: ' + calibrationPath);
  }
}

fs.readFile(calibrationFile, calibrationFileEncoding,
                function(error, data) {
                  if(error) {
                    if(error.code === 'ENOENT') {
                      console.log('Creating new calibration file: ' +
                                  calibrationFile);
                    } else {
                      console.log('Error while reading calibration file: ' +
                                  error);
                    }
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
       typeof params.output !== 'undefined' &&
       typeof params.data !== 'undefined')
    {
      if(typeof calibrationData[params.userAgent] === 'undefined') {
        calibrationData[params.userAgent] = {};
      }

      if(typeof calibrationData[params.userAgent][params.output] == 'undefined') {
        calibrationData[params.userAgent][params.output] = [];
      }

      var date = new Date();
      calibrationData[params.userAgent][params.output].
        push([date.toISOString(), params.data]);

      fs.writeFile(calibrationFile, JSON.stringify(calibrationData));
    }
  });

  socket.on('client-params-request', function(params) {
    if(typeof calibrationData !== 'undefined') {
      var result = calibrationData[params.userAgent];
      if(typeof result !== 'undefined' &&
         typeof result[params.output] !== 'undefined') {
        // retrieve the last value
        socket.emit('client-params', result[params.output].slice(-1)[0][1]);
      }
    }
  });
  
}); // io.sockets.on('connection' ...


function click() {
  if(serverParams.active && serverParams.number !== 0) {
    serverParams.number --;
    // set timeout as soon as possible
    if (serverParams.number !== 0) {
      clickTimeout = setTimeout(click, serverParams.period);
    } else {
      serverParams.active = false;
    }  
     // broadcast
    io.emit('click', {delay : serverParams.delay,
                      gain : serverParams.gain,
                      duration : serverParams.duration});
  }

  // TODO: limit broadcast to control clients
  io.emit('server-params', serverParams);
}

// run by default
click();
