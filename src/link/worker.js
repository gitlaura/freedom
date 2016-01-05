/*globals Worker */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */
var Link = require('../link');

/* Object to keep track of worker stats */
var workers = {};

/* Log worker stats */
function logWorker(id){
    console.log('worker id: ' + id + ', transfer time: ' + workers[id].average.toFixed(3) +
        'ms, messages per second: ' + workers[id].mps);
}

var intervalSeconds = 5;

/**
 * Update average transfer time and messages per second at intervalSeconds; log
 * workers that have activity
 * */
setInterval(function(){
  for (var id in workers){
    if (workers.hasOwnProperty(id)){
      workers[id].mps = workers[id].currentCount/intervalSeconds;
      workers[id].average = workers[id].sum/workers[id].currentCount;
      workers[id].currentCount = 0;
      workers[id].sum = 0;
      if(workers[id].mps > 0){
        logWorker(id);
      }
    }
  }
}, intervalSeconds * 1000);

/* Floating point milliseconds since browser opened */
function getTime(){
  return this.performance.now();
}

/* Update count of messages and sum of times for current worker every time a message is received */
function updateTransferTime(msg, workerId){
  if(!(workerId in workers)){
    workers[workerId] = {'average': 0, 'sum': 0, 'currentCount': 0, 'mps': 0};
  }

  var worker = workers[workerId];
  var transferTime = getTime() - msg.data.timeSent;
  worker.sum += transferTime;
  worker.currentCount++;

  if(transferTime > 1000){
    console.log('**ALERT: HIGH TRANSFER TIME**');
    console.log('worker id: ' + workerId + ', transfer time: ' + transferTime);
  }
}

/**
 * A port providing message transport between two freedom contexts via Worker.
 * @class Worker
 * @extends Link
 * @uses handleEvents
 * @constructor
 */
var WorkerLink = function(id, resource) {
  Link.call(this, id, resource);
  if (id) {
    this.id = id;
  }
};

/**
 * Start this port by listening or creating a worker.
 * @method start
 * @private
 */
WorkerLink.prototype.start = function() {
  if (this.config.moduleContext) {
    this.setupListener();
  } else {
    this.setupWorker();
  }
};

/**
 * Stop this port by destroying the worker.
 * @method stop
 * @private
 */
WorkerLink.prototype.stop = function() {
  // Function is determined by setupListener or setupFrame as appropriate.
};

/**
 * Get the textual description of this port.
 * @method toString
 * @return {String} the description of this port.
 */
WorkerLink.prototype.toString = function() {
  return "[Worker " + this.id + "]";
};

/**
 * Set up a global listener to handle incoming messages to this
 * freedom.js context.
 * @method setupListener
 */
WorkerLink.prototype.setupListener = function() {
  var onMsg = function(msg){
    updateTransferTime(msg, this.id);
    this.emitMessage(msg.data.flow, msg.data.message);
  }.bind(this);
  this.obj = this.config.global;
  this.obj.addEventListener('message', onMsg, true);
  this.stop = function() {
    this.obj.removeEventListener('message', onMsg, true);
    delete this.obj;
  };
  this.emit('started');
  this.obj.postMessage("Ready For Messages");
};

/**
 * Set up a worker with an isolated freedom.js context inside.
 * @method setupWorker
 */
WorkerLink.prototype.setupWorker = function() {
  var worker,
    blob,
    self = this;
  worker = new Worker(this.config.source + '#' + this.id);
  worker.addEventListener('error', function(err) {
    this.onError(err);
  }.bind(this), true);
  worker.addEventListener('message', function(worker, msg) {
    if (!this.obj) {
      this.obj = worker;
      this.emit('started');
      return;
    }
    updateTransferTime(msg, this.id);
    this.emitMessage(msg.data.flow, msg.data.message);
  }.bind(this, worker), true);
  this.stop = function() {
    worker.terminate();
    if (this.obj) {
      delete this.obj;
    }
  };
};

/**
 * Receive messages from the hub to this port.
 * Received messages will be emitted from the other side of the port.
 * @method deliverMessage
 * @param {String} flow the channel/flow of the message.
 * @param {Object} message The Message.
 */
WorkerLink.prototype.deliverMessage = function(flow, message) {
  if (flow === 'control' && message.type === 'close' &&
      message.channel === 'control') {
    this.stop();
  } else {
    var now = getTime();
    if (this.obj) {
      var idString = now.toString();
      var id = idString.substr(idString.length - 6);
      this.obj.postMessage({
        flow: flow,
        message: message,
        timeSent: now
      });
    } else {
      this.once('started', this.onMessage.bind(this, flow, message, now));
    }
  }
};

module.exports = WorkerLink;

