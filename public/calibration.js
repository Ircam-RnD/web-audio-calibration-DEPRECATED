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
var clientParams = {
  active : false, // do not run by default (manual activation is needed for iOS)
  delay : 0, // delay to compensate, in milliseconds
  gain : 0, // gain to compensate, in dB (power)
};

var clickParams = {
  duration : 0.05, // milliseconds (2 samples at 44100 Hz)
  gain : -10 // dB (for the noise part)
};

var audioContext;
var clickBuffer;
var masterGain;

/** @private
    @return {number} An exponential gain value (1e-6 for -60dB) */
var dBToPow = function(dBValue) {
  return Math.pow(10, dBValue / 10);
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
  var g = dBToPow(clickParams.gain);
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

  masterGain = audioContext.createGain();  
  // opposite to compensate client gain
  masterGain.gain.value = dBToPow(-clientParams.gain);
  masterGain.connect(audioContext.destination);

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
  for(var key in clientParams) {
    if(key === 'active') {
      clientParams[key] = document.getElementById(key).checked;
      isActive = clientParams.active;
      // active status is not stored
    } else if(key !== 'undefined') {
      clientParams[key] = document.getElementById(key).value;
      if(localStorageEnabled) {
        try {
          localStorage[localStoragePrefix + key] = clientParams[key];
        } catch (error) {
          console.log(error.message);
          localStorageEnabled = false;
        }
      }
    }
  }
  
  socket.emit('client-params-store', {userAgent : platform.ua,
                                      delay : clientParams.delay,
                                      gain : clientParams.gain});
  
  // opposite to compensate client gain
  masterGain.gain.value = dBToPow(-clientParams.gain);

  // click on activation (user-triggered sound is mandatory to init iOS web audio)
  if(isActive && ! wasActive) {
    playClick({gain : -10, delay : 0, duration : 100});
  }
}

function updateClientDisplay() {
  for(var key in clientParams) {
    if(key === 'active') {
      document.getElementById(key).checked = clientParams[key];
    } else if(key !== 'undefined') {
      document.getElementById(key).value = clientParams[key];
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
  clickGain.gain.value = dBToPow(params.gain);
  clickGain.connect(masterGain);
  
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
                     (params.delay - clientParams.delay) * 0.001);
}

function init() {
  makeAudioContext();

  // retrieve from local storage
  var localStorageUsed = false;
  if(localStorageEnabled) {
    for(var key in clientParams) {
      if(typeof localStorage[localStoragePrefix + key] !== 'undefined') {
        localStorageUsed = true;
        clientParams[key] = localStorage[localStoragePrefix + key];
      }
    }
  }

  // update anyway (at least for page reload)
  updateClientDisplay();
  
  socket.on('client-params', function(params) {
    for(var key in params) {
      if(typeof params[key] !== 'undefined') {
        clientParams[key] = params[key];
      }
    }
    updateClientDisplay();
  });

  if(! localStorageUsed) {
    socket.emit('client-params-request', platform.ua);
  }

  socket.on('click', function(params) {
    if(clientParams.active) {
      playClick(params);
    }
  });

}

