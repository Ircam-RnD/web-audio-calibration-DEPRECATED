var socket = io.connect();

var serverParams = {};

function idSetValue(id, increment) {
  var element = document.getElementById(id);
  element.value = Number(increment); 
  updateServerParams();
}

function idIncrementValue(id, increment) {
  var element = document.getElementById(id);
  element.value = Number(element.value) + Number(increment); 
  updateServerParams();
}

// on connect, local update (value and display) 
socket.on('server-params', function(params) {
  for(var key in params) {
    var element = document.getElementById(key);
    if(key === 'active') {
      // update on change only, to allow for editting
      if(serverParams[key] !== params[key]) {
        element.checked = params[key];
      }
    } else {
      if(serverParams[key] !== params[key]) {
        element.value = params[key];
        if(element.className === 'milliseconds') {
          element.value *= 1000;
        }
      }
    }
    serverParams[key] = params[key];
  }
});

function updateServerParams() {
  if(serverParams !== {}) {
    var changed = false;
    for(var key in serverParams) {
      var element = document.getElementById(key);
      if(key === 'active') {
        serverParams[key] = element.checked;      
      } else {
        serverParams[key] = Number(element.value);
        if(element.className ==='milliseconds') {
          serverParams[key] *= 0.001;
        }
      }
    }    
    socket.emit('server-params', serverParams);
  }
}
