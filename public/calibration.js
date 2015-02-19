/*global platform, io */

var socket = io.connect();

var localStoragePrefix = 'web-audio-calibration.';
var localStorageEnabled = typeof localStorage !== 'undefined';
if(localStorageEnabled) {
  try {
    localStorage[localStoragePrefix + 'storage-enabled'] = true;
    localStorage.removeItem(localStoragePrefix + 'storage-enabled');
  } catch (error) {
    localStorageEnabled = false;
  }
}

// default parameters
// restore local storage, if it exists, or
// use values from server, with the same user agent
//
// WARNING: clientParams values are the opposite of those in the interface
//          (the interface sets the compensation)
var clientParams = {
  audioActive : false, // do not run by default (manual activation is needed for iOS)
  output : 'internal', // 'internal' or 'external'
  internal : { delay : 0, // client delay, in seconds
               gain : 0   // client gain, in dB (linear)
          },
  external : { delay : 0,
               gain : 0
             }
};

var clickParams = {
  duration : (2 / 44100), // seconds (2 samples at 44100 Hz)
  gain : -20 // linear dB (for the noise part)
};

var syncParams = {
  intervalInit : 0.2, // in seconds, to bootstrap
  intervalAlive : 10, // in seconds
  interval : 1, // in seconds, current
  offset : 0, // current offset, in seconds
  // 2D circular buffer: round-trip duration, and clock offset, in seconds
  data : [ [] ], 
  dataNext : 0, // next index in circular buffer
  dataLength : 20, // logical size of circular buffer
  dataBest : 4, // calculate offset only on quickest roundtrip time
  timeoutID : 0 // to clear timeout
};

var audioContext;
var clickBuffer;

function getLocalTime() {
  return audioContext.currentTime; 
}

/** @private
    @return {number} A linear gain value (1e-3 for -60dB) */
var dBToLin = function(dBValue) {
  return Math.pow(10, dBValue / 20);
};

/** 
 * @param {Number} duration in milliseconds (minimum will be 2 samples anyway)
 */
function generateClickBuffer(duration) {
  var channels = 1;
  
  var length = Math.max(2, duration * audioContext.sampleRate);
  var buffer = audioContext.createBuffer(channels, length,
                                         audioContext.sampleRate);
  // buffer.copyToChannel(array, 0); // error on Chrome?
  var data = buffer.getChannelData(0);

  // first 2 samples are actual click, the rest is fixed noise
  data[0] = 1;
  data[1] = -1;

  // TODO: provide a seed
  var g = dBToLin(clickParams.gain);
  for(var i = 2; i < length; i++) {
    data[i] = g * (Math.random() * 2 - 1);
  }
  clickBuffer = buffer;
}

function makeAudioContext() {
  if (audioContext) {
    return;
  }
  try {
    audioContext = new AudioContext();
  } catch (e) {
    alert("This browser doesn't support the Web Audio API. Try the latest version of Chrome or Firefox.");
    return;
  }

  generateClickBuffer(clickParams.duration);
}

function idSetValue(id, value) {
  var element = document.getElementById(id);
  element.value = Number(value); 
  updateClientParams();
}

function idIncrementValue(id, increment) {
  var element = document.getElementById(id);
  element.value = Number(element.value) + Number(increment); 
  updateClientParams();
}

function updateClientParams() {
  var wasAudioActive = clientParams.audioActive;
  var isAudioActive = false;

  // set output first, as it is used to dispatch the data
  if(typeof clientParams !== 'undefined') {
    // output changed
    clientParams.output = document.getElementById('output').value;
    clientParams.audioActive = document.getElementById('audioActive').checked;
    isAudioActive = clientParams.audioActive;
    
    var params = ['delay', 'gain'];
    for(var p in params) {
      var key = params[p];
      if(typeof key !== 'undefined') {
        var element = document.getElementById(key);
        clientParams[clientParams.output][key] =
          // compensation is the opposite of intrinsic vale
          // (compensation in the interface; intrisic in clientParams)
          - Number(element.value);
        if(element.className === 'milliseconds') {
          clientParams[clientParams.output][key] *= 0.001;
        }
      }
    }
  }
  
  // click on activation
  // (user-triggered sound is mandatory to init iOS web audio)
  if(isAudioActive && ! wasAudioActive) {
    playClick({gain : -10, delay : 0, duration : 0.100});
  }
}

function updateClientDisplay() {
  if(typeof clientParams !== 'undefined') {
    document.getElementById('output').value = clientParams.output;
    document.getElementById('audioActive').checked = clientParams.audioActive;

    var params = ['delay', 'gain'];
    for(var p in params) {
      var key = params[p];
      if(typeof params[p] !== 'undefined') {
        var element = document.getElementById(key);
        element.value =
          // compensation is the opposite of intrinsic vale
          // (compensation in the interface; intrisic in clientParams)
          - Number(clientParams[clientParams.output][key]);
        if(element.className === 'milliseconds') {
          element.value *= 1000;
        }
      }
    }
  }    
}

function playClick(params) {
  if(clickParams.duration !== params.duration) {
    clickParams.duration = params.duration;
    generateClickBuffer(clickParams.duration);
  }
  
  var now = getLocalTime();
  console.log('click');
  
  var clickGain = audioContext.createGain();  

  // opposite to compensate client gain
  clickGain.gain.value = dBToLin(params.gain -
                                 clientParams[clientParams.output].gain);
  clickGain.connect(audioContext.destination);
  
  var bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = clickBuffer;
  bufferSource.connect(clickGain);

  // duration parameter ignored? on Safari (7.1.2), Firefox (34)

  // compensate client delay
  bufferSource.start(now +
                     Math.max(params.delay -
                              clientParams[clientParams.output].delay) );
}

function validate() {
  // TODO: validate for only one output
  storeLocalAndServer();
}

function storeLocalAndServer() {
  if(typeof clientParams !== 'undefined') {
      if(localStorageEnabled) {
        try {
          localStorage[localStoragePrefix + clientParams.output] =
            JSON.stringify(clientParams[clientParams.output]);
        } catch (error) {
          console.log(error.message);
          localStorageEnabled = false;
        }
      }
      socket.emit('client-params-store',
                  {userAgent : platform.ua,
                   output : clientParams.output,
                   data : clientParams[clientParams.output]});
  }
}

function restore() {
  restoreFromLocalOrServer();
}

function restoreFromLocalOrServer() {
  // retrieve from local storage
  var localStorageUsed = false;
  if(localStorageEnabled) {
    for(var key in clientParams) {
      if(typeof localStorage[localStoragePrefix + key] !== 'undefined') {
        localStorageUsed = true;
        clientParams[key] = JSON.parse(localStorage[localStoragePrefix + key]);
      }
    }
    updateClientDisplay();
  }

  if(! localStorageUsed) {
    socket.emit('client-params-request', {userAgent : platform.ua,
                                          output : clientParams.output});
  }  
}

var sync = function sync() {
  clearTimeout(syncParams.timeoutID);

  if(syncParams.data.length < syncParams.dataLength) {
    syncParams.interval = syncParams.intervalInit;
  } else {
    syncParams.interval = syncParams.intervalAlive;    
  }
  
  syncParams.timeoutID = setTimeout(sync, syncParams.interval * 1000);
  socket.emit('sync-request', getLocalTime() );
};

var syncInit = function(socket) {
  socket.on('sync-reply', function(params) {
    // (from sntp)
    // Timestamp Name          ID   When Generated
    // ------------------------------------------------------------
    // Originate Timestamp     T1   time request sent by client
    // Receive Timestamp       T2   time request received by server
    // Transmit Timestamp      T3   time reply sent by server
    // Destination Timestamp   T4   time reply received by client
    //
    // The roundtrip duration d and system clock offset t are defined as:
    // d = (T4 - T1) - (T3 - T2)
    // t = ((T2 - T1) + (T3 - T4)) / 2
    
    var T1 = params[0]; // time request sent by client
    var T2 = params[1]; // time request received by server 
    var T3 = params[2]; // time reply sent by server
    var T4 = getLocalTime(); // time reply received by client

    var roundtrip = T4 - T1 - (T3 - T2);
    var offset = (T2 - T1) + (T3 - T4) * 0.5;

    syncParams.data[syncParams.dataNext] = [roundtrip, offset];
    syncParams.dataNext = (syncParams.dataNext + 1) %
      syncParams.dataLength;

    if(syncParams.data.length >= syncParams.dataLength) {
      // keep only the running quickest roundtrips
      var quickest = syncParams.data.slice(0).sort().
          slice(0, syncParams.dataBest);

      var offsetMean = 0;
      for(var q = 0; q < syncParams.dataBest; ++q) {
        offsetMean += quickest[q][1];
      }
      offsetMean /= syncParams.dataBest;
      syncParams.offset = offsetMean;
    }
    
  }); // socket

  sync();
};

var getSyncOffset = function() {
  return syncParams.offset;
};


function init() {
  makeAudioContext();

  var userAgentId = document.getElementById('userAgent');
  userAgentId.innerHTML = platform.ua;
  
  syncInit(socket);
  
  socket.on('client-params', function(params) {
    for(var key in params) {
      if(typeof params[key] !== 'undefined') {
        clientParams[clientParams.output][key] = params[key];
      }
    }
    updateClientDisplay();
  });

  restoreFromLocalOrServer();

  // update anyway (at least for page reload)  
  updateClientDisplay();
  
  socket.on('click', function(params) {
    if(clientParams.audioActive) {
      playClick(params);
    }
  });

}

