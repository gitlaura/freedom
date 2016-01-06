/*globals Worker */
/*jslint indent:2, white:true, node:true, sloppy:true, browser:true */
var Link = require('../link');

/* Object to keep track of worker stats */
var workers = {};

/* Seconds until we update and log stats */
var intervalSeconds = 5;

/* Update messages per second and log worker stats at intervalSeconds */
setInterval(function(){
  for (var id in workers){
    if (workers.hasOwnProperty(id)){
      if(workers[id].currentCount > 0){
        var messageRate = workers[id].currentCount/intervalSeconds;
        var variance = 0;
        if(workers[id].currentCount > 1){
          variance = workers[id].s_k/(workers[id].currentCount - 1);
        }
        var stdev = Math.sqrt(variance);

        console.log(
            'worker id: ' + id +
            ', mean transfer time: ' + workers[id].newMean.toFixed(3) +
            ', messages per second: ' + messageRate +
            ', max: ' + workers[id].max.toFixed(3) +
            ', variance: ' + variance.toFixed(3) +
            ', standard deviation: ' + stdev.toFixed(3)
            );

        // Reset values
        workers[id].max = 0;
        workers[id].currentCount = 0;
        workers[id].sum = 0;
        workers[id].s_k = 0.0;
      }
    }
  }
}, intervalSeconds * 1000);

/** Floating point milliseconds since browser opened **/
function getTime(){
  return this.performance.now();
}

/** Update stats with new transfer time for current worker every time a message
 * is received **/
function processNewTransferTime(msg, workerId){
  if(!(workerId in workers)){
    workers[workerId] = {'sum': 0, 'max': 0, 'currentCount': 0, 'oldMean': 0, 'newMean': 0, 's_k': 0.0};
  }

  var worker = workers[workerId];
  var transferTime = getTime() - msg.data.timeSent;

  // Update worker stats
  worker.currentCount++;
  worker.sum += transferTime;
  worker.max = Math.max(worker.max, transferTime);

  // Update variance stats
  if(worker.currentCount === 1){
    worker.oldMean = worker.newMean = transferTime;
  }else{
    worker.newMean = worker.oldMean + (transferTime - worker.oldMean)/worker.currentCount;
    worker.s_k = worker.s_k + (transferTime - worker.oldMean)*(transferTime - worker.newMean);
    worker.oldMean = worker.newMean;
  }

  // Log high message transfer times
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
    processNewTransferTime(msg, this.id);
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
    processNewTransferTime(msg, this.id);
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

