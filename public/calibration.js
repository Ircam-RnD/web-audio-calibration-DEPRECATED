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
  active : false, // do not run by default (manual activation is needed for iOS)
  output : 'internal', // 'internal' or 'external'
  internal : { delay : 0, // client delay, in milliseconds
               gain : 0   // client gain, in dB (linear)
          },
  external : { delay : 0,
               gain : 0
             }
};

var clickParams = {
  duration : 0.05, // milliseconds (2 samples at 44100 Hz)
  gain : -20 // linear dB (for the noise part)
};

var audioContext;
var clickBuffer;

/** @private
    @return {number} A linear gain value (1e-3 for -60dB) */
var dBToLin = function(dBValue) {
  return Math.pow(10, dBValue / 20);
};

/** 
 * @param duration in milliseconds (minimum will be 2 samples anyway)
 */
function generateClickBuffer(duration) {
  var channels = 1;
  
  var length = Math.max(2, 0.001 * duration * audioContext.sampleRate);
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
  var wasActive = clientParams.active;
  var isActive = false;

  // set output first, as it is used to dispatch the data
  if(typeof clientParams !== 'undefined') {
    // output changed
    clientParams.output = document.getElementById('output').value;
    clientParams.active = document.getElementById('active').checked;
    isActive = clientParams.active;
    
    var params = ['delay', 'gain'];
    for(var p in params) {
      var key = params[p];
      if(typeof key != 'undefined') {
        clientParams[clientParams.output][key] =
          // compensation is the opposite of intrinsic vale
          // (compensation in the interface; intrisic in clientParams)
          - Number(document.getElementById(key).value);
      }
    }
  }
  
  // click on activation
  // (user-triggered sound is mandatory to init iOS web audio)
  if(isActive && ! wasActive) {
    playClick({gain : -10, delay : 0, duration : 100});
  }
}

function updateClientDisplay() {
  if(typeof clientParams !== 'undefined') {
    document.getElementById('output').value = clientParams.output;
    document.getElementById('active').checked = clientParams.active;

    var params = ['delay', 'gain'];
    for(var p in params) {
      var key = params[p];
      if(typeof params[p] !== 'undefined') {
        document.getElementById(key).value =
          // compensation is the opposite of intrinsic vale
          // (compensation in the interface; intrisic in clientParams)
          - Number(clientParams[clientParams.output][key]);
      }
    }
  }    
}

function playClick(params) {
  if(clickParams.duration !== params.duration) {
    clickParams.duration = params.duration;
    generateClickBuffer(clickParams.duration);
  }
  
  var now = audioContext.currentTime;
  console.log('click');
  
  var clickGain = audioContext.createGain();  

  // opposite to compensate client gain
  clickGain.gain.value = dBToLin(params.gain -
                                 clientParams[clientParams.output].gain);
  clickGain.connect(audioContext.destination);
  
  bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = clickBuffer;
  bufferSource.connect(clickGain);

  // duration parameter ignored? on Safari (7.1.2), Firefox (34)
  // bufferSource.start(now +
  //                    (params.delay - clientParams.delay) * 0.001,
  //                    0,
  //                    params.duration * 0.001);

  // compensate client delay
  bufferSource.start(now +
                     Math.max(0, 0.001 *
                              (params.delay -
                               clientParams[clientParams.output].delay)));
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

function init() {
  var userAgentId = document.getElementById('userAgent');
  userAgentId.innerHTML = platform.ua;

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
  
  makeAudioContext();

  socket.on('click', function(params) {
    if(clientParams.active) {
      playClick(params);
    }
  });

}

