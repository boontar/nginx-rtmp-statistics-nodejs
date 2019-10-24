var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var appRoot = require('app-root-path');

var xml2js = require('xml2js');
var http = require('http');
var net = require('net');
var fs = require("fs");
var requestify = require('requestify');
var router = express.Router();

var app = express();

var configuration = JSON.parse(
    fs.readFileSync("config.json")
);

var options = {
    host: configuration.edge_stats_address,
    port: configuration.edge_stats_port,
    path: configuration.path, 
};
var timer = 0;
if (configuration.timer < 500) {
    timer = 500;
} else {
    timer = configuration.timer;
}
var balancer = configuration.load_balancer_address;
var balancerPort = configuration.load_balancer_port;
var app = express();

var ioClient = require("socket.io-client")('http://' + configuration.load_balancer_address + ':' + configuration.load_balancer_port);

var packet, streams;

var Clock = {
    totalSeconds: 0,

    start: function () {
        var self = this;

        this.interval = setInterval(function () {
            self.totalSeconds += 1;

            var requ = http.request(options, callback);
            requ.end();

            requ.removeListener('data', callback);
            requ.removeListener('end', callback);

        }, timer);
    },

    pause: function () {
        clearInterval(this.interval);
        delete this.interval;
    },

    resume: function () {
        if (!this.interval) this.start();
    }
};

Clock.start();


callback = function (response) {
    var str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });

    response.on('end', function () {
            var parser = new xml2js.Parser();
            parser.parseString(str, function (err, result) {
                packet = {
                    edge: {
                        ip: configuration.edge_address,
                        uptime: result.rtmp.uptime[0],
                        accepted: result.rtmp.naccepted[0],
                        bandwidth_in: result.rtmp.bw_in[0],
                        total_traffic_in: result.rtmp.bytes_in[0],
                        bandwidth_out: result.rtmp.bw_out[0],
                        total_traffic_out: result.rtmp.bytes_out[0],
                        clients: result.rtmp.server[0].application[0].live[0].nclients[0]
                    },
                    security: {
                        key: configuration.load_balancer_key
                    }
                };

                streams = {
                    streams: {
                        ip: configuration.edge_address,
                        streams: result.rtmp.server[0].application[0].live[0].stream
                    },
                    security: {
                        key: configuration.load_balancer_key
                    }
                }

                ioClient.emit('sendserver', packet);
                ioClient.emit('sendstreams', streams);
            });


        }
    )
    ;
}
;


ioClient.on('serverUpdated', function (data) {
    data.timestamp = Date.now();
    console.log(data);
});

ioClient.on('streamsUpdated', function (data) {
    data.timestamp = Date.now();
    console.log(data);
});

ioClient.on('disconnect', function () {
    console.log("DISCONNECTED FROM LOADBALANCER SERVER");
    Clock.pause();
});

ioClient.on('connect', function () {
    console.log('CONNECTED TO LOADBALANCER SERVER!');
    Clock.resume();
});


module.exports = app;