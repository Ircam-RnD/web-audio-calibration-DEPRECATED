// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 8888;
var fs = require('fs');
var path = require('path');
var pjson = require('./package.json');

server.listen(port, function() {
  console.log('Server listening at port %d', port);
});

app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, '/public')));
app.use('/platform.js',
        express.static(path.join(__dirname, '/node_modules/platform/platform.js')));

app.get('/', function(req, res) {
  res.render('calibration');
});

app.get('/ctl', function(req, res) {
  res.render('control');
});

// public parameters
var serverParams = {
  active : true, // run by default
  delay : 0.500, // seconds
  gain : 0, // dB
  period : 1, // seconds
  number : -1, // -1 for infinite, > 0 for finite count
  duration : (2 / 44100) // seconds (0.05 ms is 2 samples at 44100 Hz)
};

var metroParams = {
  timeoutID : 0, // to cancel setTimeout
  nextClick : 0, // absolute time, in seconds
  period : 1, // in seconds
  tickDuration : 0.025 // seconds
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

try {
  var data = fs.readFileSync(calibrationFile, calibrationFileEncoding);
  calibrationData = JSON.parse(data);
} catch (error) {
  if(error.code === 'ENOENT') {
    console.log('Creating new calibration file: ' + calibrationFile);
  } else {
    console.log('Error while reading calibration file: ' + error);
  }
}
calibrationData[pjson.name + '.version'] = pjson.version;

// Must be monotonic, and in seconds
function getLocalTime(syncTime) {
  if(typeof syncTime !== 'undefined') {
    // Master time is local: no conversion
    return syncTime;
  } else {
    // Read local clock
    var time = process.hrtime();
    return time[0] + time[1] * 1e-9;
  }
}

function getSyncTime(LocalTime) {
  // sync time is local, here
  return getLocalTime(LocalTime);
}

io.sockets.on('connection', function (socket) {

  socket.on('sync-request', function(timeRequestSend) {
    var timeRequestArrived = getLocalTime();
    socket.emit('sync-reply',
                [timeRequestSend, timeRequestArrived,
                 getLocalTime() ] );
  });
  
  // brodacst to initialise controls
  io.emit('server-params', serverParams);

  socket.on('server-params', function(params) {
    var serverParamsChanged = false;
    var activate = !serverParams.active && params.active;

    for(var key in params) {
      if(params.hasOwnProperty(key)) {
        serverParamsChanged = serverParamsChanged ||
          (serverParams[key] === params[key]);
        serverParams[key] = params[key];
      }
    }
    
    if(!serverParams.active || serverParams.number === 0) {
      serverParams.active = false;
      clearTimeout(metroParams.timeoutID);
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

      if(typeof calibrationData[params.userAgent][params.output] === 'undefined') {
        calibrationData[params.userAgent][params.output] = [];
      }

      var date = new Date();
      calibrationData[params.userAgent][params.output].
        push([date.toISOString(), params.data]);

      console.log(date.toISOString());
      console.log(params.userAgent);
      console.log(params.output);
      console.log(params.data);
      
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


function clickEmit(nextClick) {
  // broadcast
  io.emit('click', {position : nextClick,
                    gain : serverParams.gain,
                    duration : serverParams.duration});
}

function click() {
  if(serverParams.active && serverParams.number !== 0) {

    clearTimeout(metroParams.timeoutID);
    debugger;
    var now = getSyncTime();

    if(metroParams.nextClick < now + serverParams.delay) {
      -- serverParams.number;

      // too late
      if(metroParams.nextClick < now) {
        console.log('too late by ' + (now -metroParams.nextClick) + ' s');
        // good restart from now
        metroParams.nextClick +=
          Math.ceil((now - metroParams.nextClick) / metroParams.period) *
          metroParams.period;

        // next one might be soon: look ahead
        if(metroParams.nextClick < now + serverParams.delay) {
          -- serverParams.number;
          console.log('soon in ' + (metroParams.nextClick - now) + ' s');
          clickEmit(metroParams.nextClick);
          metroParams.nextClick += metroParams.period;
        }
      } else {
        console.log('trigger ' + metroParams.nextClick +
                    ' (in ' + (metroParams.nextClick - now) + ' s)');
        clickEmit(metroParams.nextClick);
        metroParams.nextClick += metroParams.period;
      }
      
      
    } // within look-ahead

    // set new timeout
    if (serverParams.number !== 0) {
      metroParams.timeoutID = setTimeout(click, metroParams.tickDuration * 1000);
    } else {
      serverParams.active = false;
    }  
  }
  
  // TODO: limit broadcast to control clients
  io.emit('server-params', serverParams);
}

// run by default
click();
