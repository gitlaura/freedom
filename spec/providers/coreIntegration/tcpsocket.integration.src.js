/*jslint node:true,bitwise:true*/
/*globals Uint8Array, beforeEach, afterEach, it, expect, jasmine */
var testUtil = require('../../util');
var PromiseCompat = require('es6-promise').Promise;

module.exports = function (provider, setup) {
  'use strict';
  var testObj = {};

  beforeEach(function () {
    setup();
    testObj.dispatch = testUtil.createTestPort('msgs');
    testObj.socket = new provider.provider(
      undefined, testObj.dispatch.onMessage.bind(testObj.dispatch));
  });

  afterEach(function () {
    delete testObj.dispatch;
    delete testObj.socket;
    console.log(testObj);
  });

  function rawStringToBuffer(str) {
    var idx, len = str.length, arr = [];
    for (idx = 0; idx < len; idx += 1) {
      arr[idx] = str.charCodeAt(idx) & 0xFF;
    }
    return new Uint8Array(arr).buffer;
  }

  it("Works as a Client", function (done) {
    testObj.socket.connect('www.google.com', 80, function () {
      var written = false;
      testObj.socket.write(rawStringToBuffer(
        'GET / HTTP/1.0\n\n'), function (okay) {
          written = true;
        });
      testObj.dispatch.gotMessageAsync('onData', [], function (msg) {
        expect(written).toEqual(true);
        expect(testObj.dispatch.gotMessage('onData', [])).not.toEqual(false);
        testObj.socket.close(done);
      });
    });
  });

  it("Closes socket and open new one on the same port", function (done) {
    testObj.socket.listen('127.0.0.1', 9981, function () {
      testObj.socket.close(function () {
        testObj.socket.listen('127.0.0.1', 9981, function () {
          expect(true).toEqual(true);
          testObj.socket.close(done);
        });
      });
    });
  });

  it("Gets info on client & server sockets", function (done) {
    var cspy = jasmine.createSpy('client'),
        client,
        onconnect = function () {
          client.getInfo(function (info) {
            expect(info.localPort).toBeGreaterThan(1023);
            PromiseCompat.all([
              client.close(function () {}),
              testObj.socket.close(function () {}),
              done()]);
          });
        };

    testObj.socket.getInfo(function (info) {
      expect(info.connected).toEqual(false);
      expect(info.localPort).not.toBeDefined();
    });
    testObj.socket.listen('127.0.0.1', 0, function () {
      testObj.socket.getInfo(function (info) {
        expect(info.localPort).toBeGreaterThan(1023);
        client = new provider.provider(undefined, cspy);
        client.connect('127.0.0.1', info.localPort, onconnect);
      });
    });
  });

  it("Sends from Client to Server, onConnection/onDisconnect", function (done) {
    var cspy = jasmine.createSpy('client'),
        client,
        receiver,
        onDispatch,
        onConnect,
        onConnectionReceived;

    onDispatch = function (evt, msg) {
      if (evt === 'onDisconnect') {
        return;
      }
      expect(evt).toEqual('onData');
      expect(msg.data.byteLength).toEqual(10);
      PromiseCompat.all([ client.close(function () {}),
                          testObj.socket.close(function () {}) ]);
    };
    testObj.dispatch.gotMessageAsync('onConnection', [], function (msg) {
      expect(msg.socket).toBeDefined();
      onConnectionReceived = true;
      receiver = new provider.provider(
        undefined, onDispatch, msg.socket);
    });
    testObj.dispatch.gotMessageAsync('onDisconnect', [], function (msg) {
      expect(onConnectionReceived).toEqual(true);
      PromiseCompat.all([ receiver.close(function () {}),
                          done() ]);
    });
    onConnect = function () {
      var buf = new Uint8Array(10);
      client.write(buf.buffer, function () {});
    };
    testObj.socket.listen('127.0.0.1', 9981, function () {
      client = new provider.provider(undefined, cspy);
      client.connect('127.0.0.1', 9981, onConnect);
    });
  });

  it("Pauses and resumes", function (done) {
    // TODO: this test breaks in node (runs code after done())
    testObj.socket.connect('www.google.com', 80, function () {
      var paused = false;
      var pausedMessageCount = 0;
      testObj.dispatch.on('onMessage', function (msg) {
        if (!msg || !(msg.hasOwnProperty('data'))) {
          // Not an 'onData' message.
          return;
        }

        // One onData is allowed during pause due to https://crbug.com/360026
        if (paused && ++pausedMessageCount === 1) {
          return;
        }

        // Apart from the above exception, check that data doesn't arrive until
        // after the testObj.socket resumes.
        expect(paused).toEqual(false);
        testObj.socket.close(done);
      });

      testObj.socket.pause(function () {
        paused = true;
        // This URL is selected to be a file large enough to generate
        // multiple onData events.
        testObj.socket.write(
          rawStringToBuffer('GET /images/srpr/logo11w.png HTTP/1.0\n\n'),
          function (okay) {});

        // Wait a second before unpausing.  Data received in this second
        // will fail the expectation that paused is false in gotMessageAsync.
        setTimeout(function () {
          // The observed behavior is that the next packet is received after
          // the call to resume, but before resume returns.
          testObj.socket.resume(function () {});
          paused = false;
        }, 1000);
      });
    });
  });

  it("Secures a socket", function (done) {
    // TODO - prepareSecure test, if Chrome isn't fixing that soon
    testObj.socket.connect('www.google.com', 443, function () {
      testObj.socket.secure(function() {
        testObj.socket.getInfo(function (info) {
          expect(info.connected).toEqual(true);
          PromiseCompat.all([testObj.socket.close(function () {}),
                             done()]);
        });
      });
    });
  });

  it("Gives error when securing a disconnected socket", function(done) {
    testObj.socket.secure(function (success, err) {
      expect(err.errcode).toEqual('NOT_CONNECTED');
      done();
    });
  });

  it("Gives error when connecting to invalid domain", function (done) {
    testObj.socket.connect('www.domainexiststobreakourtests.gov', 80,
                           function (success, err) {
                             var allowedErrors = ['CONNECTION_FAILED',
                                                  'NAME_NOT_RESOLVED'];
                             expect(allowedErrors).toContain(err.errcode);
                             done();
                           });
  });

  it("Gives error when writing a disconnected socket", function(done) {
    testObj.socket.write(rawStringToBuffer(''), function (success, err) {
      expect(err.errcode).toEqual('NOT_CONNECTED');
      done();
    });
  });

  it("Gives error when closing a disconnected socket", function(done) {
    testObj.socket.close(function (success, err) {
      expect(err.errcode).toEqual('TESTOBJ.SOCKET_CLOSED');
      done();
    });
  });

  it("Gives error when listening on already allocated socket", function(done) {
    testObj.socket.listen('127.0.0.1', 9981, function () {
      testObj.socket.listen('127.0.0.1', 9981, function (success, err) {
        expect(err.errcode).toEqual('ALREADY_CONNECTED');
        testObj.socket.close(done);
      });
    });
  });

  it("Socket reusing id of closed socket is also closed", function(done) {
    var cspy = jasmine.createSpy('client'),
        client,
        clientCopy;

    testObj.dispatch.gotMessageAsync('onConnection', [], function (msg) {
      expect(msg.socket).toBeDefined();
      client.close(function () {
        clientCopy = new provider.provider(undefined, function () {},
                                           msg.socket);
        clientCopy.getInfo(function (info) {
          // TODO consider changing implementation to give more explicit failure
          expect(info.connected).toEqual(false);
          done();
        });
      });
    });
    testObj.socket.listen('127.0.0.1', 9981, function () {
      client = new provider.provider(undefined, cspy);
      client.connect('127.0.0.1', 9981, function () {});
    });

  });

  // Tests that the sockets passed to server sockets' onConnection events
  // correctly dispatch onDisconnect events.
  //
  // Note that this also implicitly tests the close() method of client sockets.
  it("onConnection sockets dispatch onDisconnect", function(done) {
    var cspy = jasmine.createSpy('client'),
        client,
        receiver;
    var onDispatch = function (evt, msg) {
      expect(evt).toEqual('onDisconnect');
      testObj.socket.close(done);
    };
    testObj.dispatch.gotMessageAsync('onConnection', [], function (msg) {
      expect(msg.socket).toBeDefined();
      receiver = new provider.provider(undefined, onDispatch, msg.socket);
      client.close(function () {});
    });

    testObj.socket.listen('127.0.0.1', 0, function () {
      testObj.socket.getInfo(function (info) {
        client = new provider.provider(undefined, cspy);
        client.connect('127.0.0.1', info.localPort, function () {});
      });
    });
  });
};
