const events = require('events');
const Matrix = require('./matrix');
const plugins = require('./plugins');
const Remotes = require('./remotes');
const Colors = require('./utils/colors');
const GObjects = require('./utils/gobjects');

// Create an eventEmitter object
const pluginBus = new events.EventEmitter();
const renderSpeed = 100;
const MATRIX_URL = process.env.MATRIX_URL || null;

let running = false;
let tick = 500;
let bus;

function setTick(_tick) {
  if (_tick >= 10) {
    tick = _tick;
  }
}

function stop() {
  running = false;
  bus.emit('stopped');
  bus.removeAllListeners();
  Matrix.clear();
}

function start(name) {
  if (running) {
    stop();
  }

  Matrix.clear();
  running = true;
  const plugin = plugins.load(name);
  plugin.init({
    ...Colors,
    ...GObjects,
    led: Matrix.led,
    ledXY: Matrix.led,
    fill: Matrix.fill,
    clear: Matrix.clear,
    size: Matrix.size,
    setTick,
    on: pluginBus.on,
  });

  // FIX: emit via bus not websocket
  WebSocket.broadcast('plugin', plugin.id);
  bus.emit('started');
}

function restart() {
  stop();
  start();
}

function resume() {
  if (!running) {
    running = true;
    bus.emit('resumed');
  }
}

function pause() {
  if (running) {
    running = false;
    bus.emit('paused');
  }
}

function loop() {
  if (running) {
    bus.emit('update');
    setTimeout(loop, tick);
  } else {
    setTimeout(loop, 10);
  }
}

function renderLoop() {
  bus.emit('draw');
  Matrix.draw();
  setTimeout(renderLoop, renderSpeed);
}

function init(_bus) {
  if (!MATRIX_URL) {
    throw new Error('Please provide MATRIX_URL as env variable!');
  }

  bus = _bus;

  bus.on('start', start);
  bus.on('stop', stop);
  bus.on('restart', restart);
  bus.on('pause', pause);
  bus.on('resume', resume);

  // events which are allowed to be forwarded to unsafe plugins
  const pluginEvents = ['started', 'stopped', 'resumed', 'paused', 'update', 'draw', 'input'];
  pluginEvents.forEach((event) => {
    bus.on(event, (...args) => {
      pluginBus.emit(event, ...args);
    });
  });

  plugins.init(bus);

  // TODO: set variable matrix size
  Matrix.init(10);

  // TODO: set matrix url
  Matrix.connect(MATRIX_URL);

  // Remotes.init();
  Remotes.on('button', (id, btns) => {
    if (btns.plus && btns.minus) {
      restart();
    }
    if (btns.btn1) {
      pause();
    }
    if (btns.btn2) {
      resume();
    }
    if (btns.minus) {
      setTick(tick + 100);
    }
    if (btns.plus) {
      setTick(tick - 100);
    }

    bus.emit('input', id, btns);
  });

  // Start loops
  loop();
  renderLoop();

  // Autostart plugin
  const autoStart = process.env.plugin_AUTOSTART || null;

  if (autoStart) {
    plugins.launch(autoStart);
  }
}

/*
function broadCastLed() {
  webSocket.broadcast({
    type: 'led',
    id,
    rgb,
  }, true);

  if (Matrix.connected) {
    let x = Math.floor(id / Matrix.size);
    const y = id % Matrix.size;
    if (y % 2 === 0) {
      x = Matrix.size - x - 1;
    }
    id = (y * Matrix.size + x);
    const data = [];
    data.push(1);
    data.push(id);
    data.push(rgb.r);
    data.push(rgb.g);
    data.push(rgb.b);
    serial.write(data, (err) => {
      if (err) {
        log(`Serial Error: ${err.message}`);
      }
    });
  }
}
*/

module.exports = {
  init,
  start,
  stop,
  restart,
  pause,
  resume,
};
