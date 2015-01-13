var socket = io.connect();

// parameters
// TODO: initialise from local storage, or server data base
var clientParams = {
  active : true, // run by default
  delay : 0, // milliseconds
  gain : 0, // dB
};

var clickParams = {
  duration : 0.05, // milliseconds (2 samples at 44100 Hz)
  gain : -10 // dB (for the noise part)
};

var audioContext;
var clickBuffer;
var masterGain;

/** @private
    @return {number} A linear gain value (1e-3 for -60dB*/
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
  masterGain.gain.value = dBToPow(clientParams.gain);
  masterGain.connect(audioContext.destination);

  generateClickBuffer(clickParams.duration);
}

function idSetValue(id, increment) {
  var element = document.getElementById(id);
  element.value = Number(increment); 
  updateClientParams();
}

function idIncrementValue(id, increment) {
  var element = document.getElementById(id);
  element.value = Number(element.value) + Number(increment); 
  updateClientParams();
}

function updateClientParams() {
  for(var key in clientParams) {
    if(key === 'active') {
      clientParams[key] = document.getElementById(key).checked;      
    } else if(key !== 'undefined') {
      clientParams[key] = document.getElementById(key).value;
    }
  }    
  socket.emit('client-params', clientParams);
  
  masterGain.gain.value = dBToPow(clientParams.gain);
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

function init() {
  makeAudioContext();
  updateClientDisplay();
  
  // on connect, local update (value and display) 
  socket.on('client-params', function(params) {
    for(var key in params) {
      if(key === 'active') {
        document.getElementById(key).checked = params[key];      
      } else {
        document.getElementById(key).value = params[key];
      }
      clientParams[key] = params[key];
    }
  });

  socket.on('click', function(params) {
    if(clickParams.duration !== params.duration) {
      clickParams.duration = params.duration;
      generateClickBuffer(clickParams.duration);
    }
    
    if(clientParams.active) {
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
      bufferSource.start(now +
                         (params.delay - clientParams.delay) * 0.001);
    }
  });

}

