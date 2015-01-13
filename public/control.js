var socket = io.connect();

var serverParams = {};

// on connect, local update (value and display) 
socket.on('server-params', function(params) {
  for(var key in params) {
    if(key === 'active') {
      // update on change only, to allow for editting
      if(serverParams[key] !== params[key]) {
        document.getElementById(key).checked = params[key];
      }
    } else {
      if(serverParams[key] !== params[key]) {
        document.getElementById(key).value = params[key];
      }
    }
    serverParams[key] = params[key];
  }
});

function updateServerParams() {
  if(serverParams !== {}) {
    var changed = false;
    for(var key in serverParams) {
      if(key === 'active') {
        changed = changed ||
          (serverParams[key] !== document.getElementById(key).checked);
        serverParams[key] = document.getElementById(key).checked;      
      } else {
        changed == changed ||
          (serverParams[key] !== document.getElementById(key).value);
        serverParams[key] = document.getElementById(key).value;
      }
    }    
    socket.emit('server-params', serverParams);
  }
}
