var socket = io.connect();

// parameters
// TODO: initialise from local storage, or server data base
var clientParams = {
  active : true, // run by default
  delay : 0, // milliseconds
  gain : 0, // dB
};

var audioContext;
var clickBuffer;
var masterGain;

/** @private
    @return {number} A linear gain value (1e-3 for -60dB*/
var dBToLin = function(dBValue) {
  return Math.pow(10, dBValue / 20);
};


function generateClickBuffer(context) {
  var channels = 1;
  // duration ignored for BufferSource.start() (Safari 7, Firefox 34)
  // var length = context.sampleRate; // 1 second (max size)
  var length = 2; 
  var buffer = context.createBuffer(channels, length, context.sampleRate);
  // buffer.copyToChannel(array, 0); // error on Chrome?
  var data = buffer.getChannelData(0);
  for(var i = 0; i < length; i++) {
    data[i] = (i + 1) & 1;
  }
  return buffer;
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
  masterGain.gain.value = dBToLin(clientParams.gain);
  masterGain.connect(audioContext.destination);

  clickBuffer = generateClickBuffer(audioContext);
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
  
  masterGain.gain.value =  dBToLin(clientParams.gain);
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
    if(clientParams.active) {
      var now = audioContext.currentTime;
      console.log('click');

      bufferSource = audioContext.createBufferSource();
      bufferSource.buffer = clickBuffer;
      bufferSource.connect(masterGain);
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

